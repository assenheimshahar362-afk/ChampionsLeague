export const AI_PREDICTION_HORIZON_HOURS = 48;

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