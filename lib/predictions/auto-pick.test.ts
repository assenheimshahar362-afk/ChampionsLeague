import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  autoPredictionForFixture,
  probabilitiesForAutoPick,
} from "./auto-pick.ts";
import type { Fixture, Team } from "../fixtures/types.ts";

function team(name: string, marketProbability: number): Team {
  return {
    id: name,
    name,
    shortName: name,
    code: name.slice(0, 3).toUpperCase(),
    color: "#123456",
    logoUrl: null,
    marketProbability,
  };
}

function fixture(homeProbability: number, awayProbability: number): Fixture {
  return {
    id: "fixture",
    season: 2026,
    stage: "league_phase",
    round: "League Stage - 1",
    kickoffAt: "2026-09-08T20:00:00.000Z",
    venue: null,
    homeTeam: team("Home", homeProbability),
    awayTeam: team("Away", awayProbability),
    status: "scheduled",
    homeGoals: null,
    awayGoals: null,
    elapsedMinutes: null,
    outcomePoints: { home: 4, draw: 8, away: 6 },
  };
}

describe("automatic predictions", () => {
  it("keeps the baseline home advantage between evenly priced teams", () => {
    const probabilities = probabilitiesForAutoPick(fixture(0.05, 0.05));
    assert.ok(probabilities.home > probabilities.away);
    assert.ok(Math.abs(probabilities.home + probabilities.draw + probabilities.away - 1) < 1e-9);
  });

  it("backs a strong home favourite", () => {
    const pick = autoPredictionForFixture(fixture(0.16, 0.004), () => 0.1);
    assert.ok(pick.homeGoals > pick.awayGoals);
  });

  it("backs a strong away favourite despite home advantage", () => {
    const pick = autoPredictionForFixture(fixture(0.004, 0.16), () => 0.95);
    assert.ok(pick.awayGoals > pick.homeGoals);
  });

  it("can produce a draw when the weighted draw interval is selected", () => {
    const pick = autoPredictionForFixture(fixture(0.05, 0.05), () => 0.5);
    assert.equal(pick.homeGoals, pick.awayGoals);
  });

  it("varies plausible scorelines while keeping every side at five or fewer", () => {
    const scoreDraws = [0.05, 0.3, 0.6, 0.9];
    const picks = scoreDraws.map((scoreDraw) => {
      const draws = [0.1, scoreDraw];
      return autoPredictionForFixture(
        fixture(0.08, 0.03),
        () => draws.shift() ?? scoreDraw
      );
    });
    const scorelines = new Set(
      picks.map((pick) => `${pick.homeGoals}-${pick.awayGoals}`)
    );

    assert.ok(scorelines.size >= 3);
    assert.ok(
      picks.every(
        (pick) =>
          pick.homeGoals > pick.awayGoals &&
          pick.homeGoals <= 5 &&
          pick.awayGoals <= 5
      )
    );
  });
});
