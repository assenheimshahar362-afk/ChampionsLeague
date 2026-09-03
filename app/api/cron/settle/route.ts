import { isAuthorisedCron, unauthorised } from "@/lib/cron/auth";
import { settleDueFixtures } from "@/lib/settle/run";

/**
 * Settlement endpoint.
 *
 * Releases finished results and awards points. Intended to run on a schedule —
 * every few minutes while a season is being replayed on compressed time, and
 * around match end for a live season.
 *
 * Idempotent, so firing it more often than necessary is harmless.
 *
 *   POST /api/cron/settle?dry=1   report what is due, settle nothing
 */

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCron(request)) return unauthorised();

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  try {
    const report = await settleDueFixtures({ dryRun });
    return Response.json({ ok: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("settlement failed", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
