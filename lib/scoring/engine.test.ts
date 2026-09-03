import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scorePrediction } from "./engine.ts";

describe("scorePrediction", () => {
  const points = { home: 4, draw: 8, away: 11 };

  it("awards the configured points for the actual outcome", () => {
    assert.equal(
      scorePrediction(
        { homeGoals: 2, awayGoals: 1 },
        { homeGoals: 3, awayGoals: 0 },
        points
      ).totalPoints,
      4
    );
    assert.equal(
      scorePrediction(
        { homeGoals: 2, awayGoals: 2 },
        { homeGoals: 1, awayGoals: 1 },
        points
      ).totalPoints,
      8
    );
    assert.equal(
      scorePrediction(
        { homeGoals: 0, awayGoals: 2 },
        { homeGoals: 1, awayGoals: 3 },
        points
      ).totalPoints,
      11
    );
  });

  it("doubles that fixture outcome's points for an exact score", () => {
    assert.equal(
      scorePrediction(
        { homeGoals: 2, awayGoals: 1 },
        { homeGoals: 2, awayGoals: 1 },
        points
      ).totalPoints,
      8
    );
    assert.equal(
      scorePrediction(
        { homeGoals: 0, awayGoals: 0 },
        { homeGoals: 0, awayGoals: 0 },
        points
      ).totalPoints,
      16
    );
    assert.equal(
      scorePrediction(
        { homeGoals: 1, awayGoals: 3 },
        { homeGoals: 1, awayGoals: 3 },
        points
      ).totalPoints,
      22
    );
  });

  it("does not award points for a wrong outcome", () => {
    assert.equal(
      scorePrediction(
        { homeGoals: 2, awayGoals: 1 },
        { homeGoals: 1, awayGoals: 2 },
        points
      ).totalPoints,
      0
    );
    assert.equal(
      scorePrediction(
        { homeGoals: 1, awayGoals: 1 },
        { homeGoals: 2, awayGoals: 1 },
        points
      ).totalPoints,
      0
    );
  });

  it("never awards anything except zero, the outcome award, or its double", () => {
    for (let h = 0; h <= 5; h++) {
      for (let a = 0; a <= 5; a++) {
        for (let ah = 0; ah <= 5; ah++) {
          for (let aa = 0; aa <= 5; aa++) {
            const actualPoints = points[ah > aa ? "home" : ah < aa ? "away" : "draw"];
            const { totalPoints } = scorePrediction(
              { homeGoals: h, awayGoals: a },
              { homeGoals: ah, awayGoals: aa },
              points
            );
            assert.ok(
              totalPoints === 0 ||
              totalPoints === actualPoints ||
              totalPoints === actualPoints * 2
            );
          }
        }
      }
    }
  });
});
