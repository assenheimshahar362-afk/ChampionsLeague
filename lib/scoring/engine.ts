import type { Fixture, Outcome, Prediction } from "@/lib/fixtures/types";

/**
 * Pure match scoring shared by live projections and settlement.
 *
 * Each fixture snapshots three awards: home win, draw, and away win. Calling
 * the correct outcome receives that fixture's award; calling the exact
 * scoreline receives twice the same award. A wrong outcome receives zero.
 */

export type OutcomePoints = Record<Outcome, number>;

/** Safe fallback for fixtures created before the per-match columns existed. */
export const DEFAULT_OUTCOME_POINTS: OutcomePoints = {
  home: 1,
  draw: 1,
  away: 1,
};

export type BreakdownLine = {
  /** Stable key for translation; never a user-facing sentence. */
  key: "wrongOutcome" | "correctOutcome" | "exactScore";
  value: number;
};

export type ScoreBreakdown = {
  totalPoints: number;
  correctOutcome: boolean;
  correctGoalDifference: boolean;
  exactScore: boolean;
  lines: BreakdownLine[];
};

export type ActualScore = { homeGoals: number; awayGoals: number };

export function outcomeFromScore(homeGoals: number, awayGoals: number): Outcome {
  if (homeGoals > awayGoals) return "home";
  if (homeGoals < awayGoals) return "away";
  return "draw";
}

export function scorePrediction(
  prediction: { homeGoals: number; awayGoals: number },
  actual: ActualScore,
  points: OutcomePoints = DEFAULT_OUTCOME_POINTS
): ScoreBreakdown {
  const actualOutcome = outcomeFromScore(actual.homeGoals, actual.awayGoals);
  const correctOutcome =
    outcomeFromScore(prediction.homeGoals, prediction.awayGoals) === actualOutcome;
  const correctGoalDifference =
    prediction.homeGoals - prediction.awayGoals ===
    actual.homeGoals - actual.awayGoals;
  const exactScore =
    prediction.homeGoals === actual.homeGoals &&
    prediction.awayGoals === actual.awayGoals;
  const outcomeAward = points[actualOutcome];

  if (exactScore) {
    const totalPoints = outcomeAward * 2;
    return {
      totalPoints,
      correctOutcome: true,
      correctGoalDifference: true,
      exactScore: true,
      lines: [{ key: "exactScore", value: totalPoints }],
    };
  }

  if (correctOutcome) {
    return {
      totalPoints: outcomeAward,
      correctOutcome: true,
      correctGoalDifference,
      exactScore: false,
      lines: [{ key: "correctOutcome", value: outcomeAward }],
    };
  }

  return {
    totalPoints: 0,
    correctOutcome: false,
    correctGoalDifference,
    exactScore: false,
    lines: [{ key: "wrongOutcome", value: 0 }],
  };
}

export function projectedPoints(
  prediction: Prediction,
  fixture: Pick<Fixture, "homeGoals" | "awayGoals" | "outcomePoints">
): ScoreBreakdown | null {
  if (fixture.homeGoals === null || fixture.awayGoals === null) return null;

  return scorePrediction(
    prediction,
    { homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals },
    fixture.outcomePoints
  );
}
