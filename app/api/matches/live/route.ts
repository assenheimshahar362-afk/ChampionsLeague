import { FootballDataError } from "@/lib/football-data/client";
import { pollLiveMatches } from "@/lib/ingest/live";

/**
 * Viewer-driven live polling fallback. The database claim inside
 * pollLiveMatches guarantees at most one provider request per minute across
 * every open browser and any scheduled cron invocation.
 */
export async function POST(): Promise<Response> {
  try {
    const report = await pollLiveMatches();
    return Response.json(
      { ok: true, report },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = error instanceof FootballDataError ? 502 : 500;
    console.error("viewer live poll failed", error);
    return Response.json(
      { ok: false, error: "Live data is temporarily unavailable." },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
