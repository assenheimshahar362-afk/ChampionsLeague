import { isAuthorisedCron, unauthorised } from "@/lib/cron/auth";
import { FootballDataError } from "@/lib/football-data/client";
import { ingestSeason } from "@/lib/ingest/season";

/**
 * Season ingestion endpoint.
 *
 * GET and POST both run the job — GET because that is what Vercel Cron issues,
 * POST because that is what `npm run ingest` sends. Route Handlers are uncached
 * by default in Next 16 and this one must never be cached, so no route config
 * is set (adding `force-static` here would serve a stale run).
 *
 *   POST /api/cron/ingest?dry=1   plan the run, make no writes
 */

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCron(request)) return unauthorised();

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  try {
    const report = await ingestSeason({ dryRun });
    return Response.json({ ok: true, report });
  } catch (error) {
    // A plan/quota rejection is the expected failure here (the free tier only
    // exposes 2022-2024), so surface the provider's own message rather than a
    // generic 500 that would send the operator digging through logs.
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
    console.error("ingest failed", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
