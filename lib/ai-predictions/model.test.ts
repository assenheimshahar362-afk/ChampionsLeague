import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculatePrediction,
  recentFormRating,
  type MatchResult,
  type PredictionSource,
} from "./model.ts";

function result(score: string, venue: "home" | "away" = "home"): MatchResult {
  return {
    date: "2026-08-01",
    competition: "Test",
    homeTeam: "Home",
    awayTeam: "Away",
    score,
    venue,
  };
}

function source(overrides: Partial<PredictionSource> = {}): PredictionSource {
  return {
    competition: "UEFA Champions League",
    fixture: {
      kickoffAt: "2026-09-08T20:00:00.000Z",
      stage: "league_phase",
      round: "League Stage - 1",
      venue: "Test stadium",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
    },
    modelProbabilities: { home: 0.5, draw: 0.25, away: 0.25 },
    recentResults: { homeTeam: [], awayTeam: [] },
    ...overrides,
  };
}

describe("transparent AI prediction model", () => {
  it("uses the stored prior unchanged when recent form is unavailable", () => {
    const prediction = calculatePrediction(source());
    assert.deepEqual(
      [
        prediction.homeWinProbability,
        prediction.drawProbability,
        prediction.awayWinProbability,
      ],
      [50, 25, 25]
    );
  });

  it("raises the home prediction when home form is stronger", () => {
    const prediction = calculatePrediction(
      source({
        recentResults: {
          homeTeam: [result("3-0"), result("2-0"), result("2-1")],
          awayTeam: [result("0-2"), result("1-2"), result("0-1")],
        },
      })
    );
    assert.ok(prediction.homeWinProbability > 50);
    assert.equal(
      prediction.homeWinProbability +
        prediction.drawProbability +
        prediction.awayWinProbability,
      100
    );
    assert.ok(prediction.predictedHomeGoals > prediction.predictedAwayGoals);
  });

  it("interprets an away result from the selected team's perspective", () => {
    assert.ok(recentFormRating([result("0-2", "away")]) > 0);
    assert.ok(recentFormRating([result("2-0", "away")]) < 0);
  });
});
