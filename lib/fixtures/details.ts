import "server-only";

import { connection } from "next/server";

import { footballDataGet } from "@/lib/football-data/client";
import { toFixtureProviderDetails } from "@/lib/football-data/mappers";
import type { WireMatch } from "@/lib/football-data/types";
import type { FixtureProviderDetails } from "@/lib/fixtures/detail-types";
import type { Fixture, FixtureStatus } from "@/lib/fixtures/types";
import {
  LIVE_POLL_LEAD_MS,
  LIVE_POLL_TAIL_MS,
} from "@/lib/ingest/live-window";
import type { Json } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const LIVE_TTL_MS = 60_000;
const SCHEDULED_TTL_MS = 5 * 60_000;
const FINISHED_TTL_MS = 7 * 24 * 60 * 60_000;
const PREMATCH_WINDOW_MS = 90 * 60_000;

function ttlFor(status: FixtureStatus): number {
  if (status === "live" || status === "halftime") return LIVE_TTL_MS;
  if (status === "scheduled") return SCHEDULED_TTL_MS;
  return FINISHED_TTL_MS;
}

function mayReleaseProviderDetails(fixture: Fixture, now: number): boolean {
  if (fixture.status === "postponed" || fixture.status === "cancelled") {
    return false;
  }

  if (fixture.status !== "scheduled") return true;

  // During historical replay the provider already knows the final events. Do
  // not request them while the effective fixture is still open for guesses.
  const replayEnabled = process.env.REBASE_ENABLED !== "false";
  return (
    !replayEnabled &&
    now >= new Date(fixture.kickoffAt).getTime() - PREMATCH_WINDOW_MS
  );
}

function isMissingDetailsTable(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /Could not find the table/i.test(error.message)
  );
}

/**
 * Loads the cached detailed provider response, refreshing only when its match
 * state requires it. Provider failures degrade to stale data or no section;
 * the core fixture page must remain available even when the football API is.
 */
export async function getFixtureProviderDetails(
  fixture: Fixture
): Promise<FixtureProviderDetails | null> {
  // Cache freshness and provider polling are intentionally evaluated against
  // the clock of the incoming request. Declare that boundary before reading
  // the clock so Cache Components never attempts to prerender this value.
  await connection();
  const now = Date.now();
  if (!mayReleaseProviderDetails(fixture, now)) return null;

  const service = createServiceRoleClient();
  const { data: cached, error: cacheError } = await service
    .from("fixture_details")
    .select("provider_status, payload, fetched_at")
    .eq("fixture_id", fixture.id)
    .maybeSingle();

  if (cacheError) {
    if (isMissingDetailsTable(cacheError)) return null;
    throw new Error(`Loading fixture details failed: ${cacheError.message}`);
  }

  const cachedDetails = cached
    ? (cached.payload as unknown as FixtureProviderDetails)
    : null;
  const cachedTtl =
    cached?.provider_status === "scheduled" &&
    now >= new Date(fixture.kickoffAt).getTime()
      ? LIVE_TTL_MS
      : cached
        ? ttlFor(cached.provider_status)
        : 0;
  if (
    cached &&
    now - new Date(cached.fetched_at).getTime() < cachedTtl
  ) {
    return cachedDetails;
  }

  // The one-per-minute live cron owns provider polling. A page view must never
  // multiply live API traffic by the number of viewers.
  if (fixture.status === "live" || fixture.status === "halftime") {
    return cachedDetails;
  }

  const kickoffDistance = now - new Date(fixture.kickoffAt).getTime();
  if (
    kickoffDistance >= -LIVE_POLL_LEAD_MS &&
    kickoffDistance <= LIVE_POLL_TAIL_MS
  ) {
    return cachedDetails;
  }

  const providerId = fixture.footballDataId;
  if (providerId === undefined) return cachedDetails;

  try {
    const response = await footballDataGet<WireMatch>(
      `/matches/${providerId}`,
      {},
      { unfold: true }
    );
    const wire = response.data;

    const details = toFixtureProviderDetails(wire);
    const { error } = await service.from("fixture_details").upsert({
      fixture_id: fixture.id,
      provider_status: details.providerStatus,
      payload: details as unknown as Json,
      fetched_at: new Date(now).toISOString(),
    });

    if (error) {
      console.error("Caching fixture details failed", error.message);
    }

    return details;
  } catch (error) {
    console.error("Refreshing fixture details failed", (error as Error).message);
    return cachedDetails;
  }
}
