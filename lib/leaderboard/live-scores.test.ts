import assert from "node:assert/strict";
import { test } from "node:test";
import { liveScoreRows } from "./live-scores.ts";
import { buildLeaderboard } from "./ranking.ts";

const fixture = { id: "match", status: "live", home_goals: 0, away_goals: 0,
  home_win_points: 3, draw_points: 4, away_win_points: 5 };
const prediction = { user_id: "player", fixture_id: "match", home_goals: 1, away_goals: 0 };
test("live points follow goals and stop contributing after full time", () => {
  assert.equal(liveScoreRows([fixture], [prediction])[0].totalPoints, 0);
  assert.equal(liveScoreRows([{ ...fixture, home_goals: 1 }], [prediction])[0].totalPoints, 6);
  assert.equal(liveScoreRows([{ ...fixture, home_goals: 2 }], [prediction])[0].totalPoints, 3);
  assert.deepEqual(liveScoreRows([{ ...fixture, status: "finished" }], [prediction]), []);
  assert.deepEqual(liveScoreRows([{ ...fixture, status: "scheduled" }], [prediction]), []);
  assert.deepEqual(liveScoreRows([{ ...fixture, home_goals: null }], [prediction]), []);
});
test("provisional points change rank totals without changing settled statistics", () => {
  const rows = buildLeaderboard({
    eligibleUserIds: ["player"], profiles: [{ id: "player", displayName: "Player", avatarUrl: null }],
    scores: [
      { userId: "player", totalPoints: 3, exactScore: false, correctOutcome: true },
      ...liveScoreRows([{ ...fixture, home_goals: 1 }], [prediction]),
    ], seasonPicks: [], viewerUserId: "player", currentSeason: 2026, picksRevealed: true,
  });
  assert.equal(rows[0].points, 9);
  assert.equal(rows[0].settled, 1);
  assert.equal(rows[0].exact, 0);
});
