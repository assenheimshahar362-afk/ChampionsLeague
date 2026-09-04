import "server-only";

import { serverEnv } from "@/lib/env.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type FootballDataQuota = {
  requestsAvailable: number | null;
  resetSeconds: number | null;
};

export class FootballDataError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status: number,
    readonly providerError?: unknown
  ) {
    super(message);
    this.name = "FootballDataError";
  }
}

export type FootballDataCallResult<T> = { data: T; quota: FootballDataQuota };

const MIN_SPACING_MS = 6_200;
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function waitForDistributedPermit(
  requestKind: "background" | "live"
): Promise<void> {
  const db = createServiceRoleClient();
  while (true) {
    const { data: waitMs, error } = await db.rpc(
      "claim_football_data_request",
      { request_kind: requestKind }
    );
    if (error) {
      throw new FootballDataError(
        `Unable to claim provider quota: ${error.message}`,
        "rate-limit",
        0
      );
    }
    if (waitMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function toInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function token(): string {
  const value = serverEnv().FOOTBALL_DATA_API_TOKEN;
  if (!value) {
    throw new FootballDataError(
      "FOOTBALL_DATA_API_TOKEN is not configured.",
      "configuration",
      0
    );
  }
  return value;
}

/** Fail-closed shared gate for provider refreshes initiated by page views. */
export async function claimFootballDataViewerRefresh(): Promise<boolean> {
  const { data, error } = await createServiceRoleClient().rpc(
    "claim_football_data_viewer_refresh"
  );
  if (error) {
    console.error("Claiming viewer provider refresh failed", error.message);
    return false;
  }
  return data;
}

export async function footballDataGet<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  options: { unfold?: boolean; requestKind?: "background" | "live" } = {}
): Promise<FootballDataCallResult<T>> {
  const env = serverEnv();
  const baseUrl = env.FOOTBALL_DATA_BASE_URL.replace(/\/$/, "");
  const url = new URL(baseUrl + endpoint);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return schedule(async () => {
    await waitForDistributedPermit(options.requestKind ?? "background");
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "X-Auth-Token": token(),
          ...(options.unfold
            ? {
                "X-Unfold-Lineups": "true",
                "X-Unfold-Bookings": "true",
                "X-Unfold-Subs": "true",
                "X-Unfold-Goals": "true",
              }
            : {}),
        },
        cache: "no-store",
      });
    } catch (cause) {
      throw new FootballDataError(
        `Network failure calling ${endpoint}: ${(cause as Error).message}`,
        endpoint,
        0
      );
    }

    const quota = {
      requestsAvailable: toInt(response.headers.get("x-requestsavailable")),
      resetSeconds: toInt(response.headers.get("x-requestcounter-reset")),
    };
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text.slice(0, 500);
    }

    if (!response.ok) {
      const detail =
        body && typeof body === "object" && "message" in body
          ? String(body.message)
          : body && typeof body === "object" && "error" in body
            ? String(body.error)
            : `HTTP ${response.status}`;
      throw new FootballDataError(
        `${endpoint} rejected: ${detail}`,
        endpoint,
        response.status,
        body
      );
    }

    return { data: body as T, quota };
  });
}
