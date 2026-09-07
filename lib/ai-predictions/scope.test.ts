import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fixturesForPredictionScope,
  upcomingMatchWeekFixtures,
} from "./scope.ts";

describe("AI prediction batch scope", () => {
  it("selects every fixture in the nearest upcoming match week", () => {
    const fixtures = [
      { id: "later", season: 2026, round: "Round 3", kickoff_at: "2026-09-16T20:00:00Z" },
      { id: "week-b", season: 2026, round: "Round 2", kickoff_at: "2026-09-09T20:00:00Z" },
      { id: "week-a", season: 2026, round: "Round 2", kickoff_at: "2026-09-08T20:00:00Z" },
      { id: "other-season", season: 2025, round: "Round 2", kickoff_at: "2026-09-08T21:00:00Z" },
    ];

    assert.deepEqual(
      upcomingMatchWeekFixtures(fixtures).map((fixture) => fixture.id),
      ["week-a", "week-b"]
    );
  });

  it("returns an empty list when no future fixtures were supplied", () => {
    assert.deepEqual(upcomingMatchWeekFixtures([]), []);
  });

  it("allows a single fixture in either the horizon or the upcoming match week", () => {
    const fixtures = [
      { id: "week-a", season: 2026, round: "Round 2", kickoff_at: "2026-09-08T20:00:00Z" },
      { id: "week-b", season: 2026, round: "Round 2", kickoff_at: "2026-09-09T20:00:00Z" },
      { id: "overlap", season: 2026, round: "Round 3", kickoff_at: "2026-09-08T21:00:00Z" },
      { id: "later", season: 2026, round: "Round 3", kickoff_at: "2026-09-16T20:00:00Z" },
    ];

    assert.deepEqual(
      fixturesForPredictionScope(
        fixtures,
        "horizon-or-upcoming-round",
        "2026-09-08T21:30:00Z"
      ).map((fixture) => fixture.id),
      ["week-a", "overlap", "week-b"]
    );
  });
});
