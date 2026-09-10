import { isAuthorisedCron, unauthorised } from "@/lib/cron/auth";
import { FootballDataError } from "@/lib/football-data/client";
import { pollLiveMatches } from "@/lib/ingest/live";

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCron(request)) return unauthorised();

  try {
    const report = await pollLiveMatches();
    if (
      report.fixturesUpdated > 0 ||
      report.resultsStored > 0 ||
      report.settledFixtures > 0
    ) {
      revalidateTag(CACHE_TAGS.fixtures, { expire: 0 });
    }
    return Response.json({ ok: true, report });
  } catch (error) {
    if (error instanceof FootballDataError) {
      return Response.json(
        {
          ok: false,
          error: error.message,
          endpoint: error.endpoint,
          providerError: error.providerError ?? null,
        },
        { status: 502 }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("live poll failed", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
import { revalidateTag } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
