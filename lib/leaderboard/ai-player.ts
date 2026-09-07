import { scorePrediction, type OutcomePoints } from "../scoring/engine.ts";

export const AI_PLAYER_ID = "ai-predictor";

export type AiFixtureScore = {
  fixtureId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  settled: boolean;
  outcomePoints: OutcomePoints;
};

export type AiFixturePrediction = {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
};

export function buildAiScoreRows(
  fixtures: AiFixtureScore[],
  predictions: AiFixturePrediction[]
) {
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));

  return predictions.flatMap((prediction) => {
    const fixture = fixtureById.get(prediction.fixtureId);
    if (
      !fixture ||
      !fixture.settled ||
      fixture.homeGoals === null ||
      fixture.awayGoals === null
    ) {
      return [];
    }

    const score = scorePrediction(
      prediction,
      { homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals },
      fixture.outcomePoints
    );

    return [{
      userId: AI_PLAYER_ID,
      totalPoints: score.totalPoints,
      exactScore: score.exactScore,
      correctOutcome: score.correctOutcome,
    }];
  });
}