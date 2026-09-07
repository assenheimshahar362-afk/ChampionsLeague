import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  openPredictionFixtureIds,
  participantCompletionByUser,
} from "./completeness.ts";

describe("admin participant completion", () => {
  const now = Date.parse("2026-09-07T12:00:00.000Z");
  const fixtures = [
    { id: "next", season: 2026, status: "scheduled", kickoff_at: "2026-09-08T18:00:00.000Z" },
    { id: "later", season: 2026, status: "scheduled", kickoff_at: "2026-09-10T18:00:00.000Z" },
    { id: "past", season: 2026, status: "scheduled", kickoff_at: "2026-09-06T18:00:00.000Z" },
    { id: "cancelled", season: 2026, status: "cancelled", kickoff_at: "2026-09-08T18:00:00.000Z" },
    { id: "old-season", season: 2025, status: "scheduled", kickoff_at: "2026-09-08T18:00:00.000Z" },
  ];

  it("counts only future scheduled fixtures in the active season", () => {
    assert.deepEqual(openPredictionFixtureIds(fixtures, 2026, now), [
      "next",
      "later",
    ]);
  });

  it("tracks season choices and missing match predictions per user", () => {
    const completion = participantCompletionByUser(
      ["complete", "missing"],
      2026,
      ["next", "later"],
      [{ user_id: "complete", fixture_id: "next" }],
      [
        {
          user_id: "complete",
          season: 2026,
          champion_candidate_id: 1,
          top_scorer_candidate_id: 2,
        },
        {
          user_id: "missing",
          season: 2025,
          champion_candidate_id: 3,
          top_scorer_candidate_id: 4,
        },
      ]
    );

    assert.deepEqual(completion.get("complete"), {
      championPicked: true,
      topScorerPicked: true,
      missingPredictionFixtureIds: ["later"],
    });
    assert.deepEqual(completion.get("missing"), {
      championPicked: false,
      topScorerPicked: false,
      missingPredictionFixtureIds: ["next", "later"],
    });
  });
});
