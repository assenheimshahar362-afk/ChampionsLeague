export const AI_PREDICTION_HORIZON_HOURS = 48;

export type AiPredictionFixtureAvailability =
  | "eligible"
  | "too-early"
  | "closed";

export function aiPredictionHorizonHours(
  requestedHours?: number | null
): number {
  if (requestedHours === null || requestedHours === undefined) {
    return AI_PREDICTION_HORIZON_HOURS;
  }
  if (!Number.isFinite(requestedHours)) {
    return AI_PREDICTION_HORIZON_HOURS;
  }
  return Math.min(
    AI_PREDICTION_HORIZON_HOURS,
    Math.max(1, requestedHours)
  );
}

export function aiPredictionFixtureAvailability(
  status: string,
  kickoffAt: string,
  nowMs: number
): AiPredictionFixtureAvailability {
  const kickoffMs = new Date(kickoffAt).getTime();
  if (status !== "scheduled" || !Number.isFinite(kickoffMs) || kickoffMs <= nowMs) {
    return "closed";
  }

  const horizonMs = AI_PREDICTION_HORIZON_HOURS * 60 * 60_000;
  return kickoffMs <= nowMs + horizonMs ? "eligible" : "too-early";
}
