import assert from "node:assert/strict";
import test from "node:test";

import { AI_PLAYER_ID, buildAiScoreRows } from "./ai-player.ts";

test("AI player scores use the stored fixture awards", () => {
  const rows = buildAiScoreRows(
    [{
      fixtureId: "played",
      homeGoals: 2,
      awayGoals: 1,
      settled: true,
      outcomePoints: { home: 4, draw: 7, away: 6 },
    }],
    [{ fixtureId: "played", homeGoals: 2, awayGoals: 1 }]
  );

  assert.deepEqual(rows, [{
    userId: AI_PLAYER_ID,
    totalPoints: 8,
    exactScore: true,
    correctOutcome: true,
  }]);
});

test("AI player ignores predictions without a released score", () => {
  const rows = buildAiScoreRows(
    [{
      fixtureId: "future",
      homeGoals: null,
      awayGoals: null,
      settled: false,
      outcomePoints: { home: 2, draw: 3, away: 4 },
    }],
    [{ fixtureId: "future", homeGoals: 1, awayGoals: 0 }]
  );

  assert.deepEqual(rows, []);
});

test("AI player does not receive temporary points during a live match", () => {
  const rows = buildAiScoreRows(
    [{
      fixtureId: "live",
      homeGoals: 1,
      awayGoals: 0,
      settled: false,
      outcomePoints: { home: 2, draw: 3, away: 4 },
    }],
    [{ fixtureId: "live", homeGoals: 1, awayGoals: 0 }]
  );

  assert.deepEqual(rows, []);
});