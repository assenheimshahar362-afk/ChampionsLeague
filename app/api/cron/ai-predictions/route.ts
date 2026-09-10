import { revalidateTag } from "next/cache";

import { generateDueAiPredictions } from "@/lib/ai-predictions/generate";
import { aiPredictionHorizonHours } from "@/lib/ai-predictions/horizon";
import { isAuthorisedCron, unauthorised } from "@/lib/cron/auth";
import { CACHE_TAGS } from "@/lib/cache-tags";

export const maxDuration = 300;

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCron(request)) return unauthorised();

  const search = new URL(request.url).searchParams;
  const hours = search.get("hours");
  const horizonHours = aiPredictionHorizonHours(
    hours === null ? undefined : Number(hours)
  );

  try {
    const report = await generateDueAiPredictions({
      horizonHours,
      force: search.get("force") === "1",
    });
    if (report.generated > 0) {
      revalidateTag(CACHE_TAGS.aiPredictions, { expire: 0 });
    }
    return Response.json({ ok: report.failures.length === 0, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("AI prediction generation failed", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
