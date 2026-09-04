import { FootballDataError } from "@/lib/football-data/client";
import { pollLiveMatches } from "@/lib/ingest/live";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Viewer-driven live polling fallback. The database claim inside
 * pollLiveMatches guarantees at most one provider request per minute across
 * every open browser and any scheduled cron invocation.
 */
export async function POST(): Promise<Response> {
  try {
    const { data: claimed, error: claimError } = await createServiceRoleClient().rpc(
      "claim_public_live_request"
    );
    if (claimError) {
      console.error("public live rate-limit claim failed", claimError.message);
      return Response.json(
        { ok: false, error: "Live data is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } }
      );
    }
    if (!claimed) {
      return Response.json(
        { ok: false, error: "Too many live refresh requests." },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "3" } }
      );
    }

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
