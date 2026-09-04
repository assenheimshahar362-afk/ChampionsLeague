import { generateDueAiPredictions } from "@/lib/ai-predictions/generate";
import { isAuthorisedCron, unauthorised } from "@/lib/cron/auth";

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCron(request)) return unauthorised();

  const search = new URL(request.url).searchParams;
  const requestedHours = Number(search.get("hours") ?? "24");
  const horizonHours = Number.isFinite(requestedHours)
    ? Math.min(336, Math.max(1, requestedHours))
    : 24;

  try {
    const report = await generateDueAiPredictions({
      horizonHours,
      force: search.get("force") === "1",
    });
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