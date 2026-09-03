import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { WireMatch, WireScorer } from "../football-data/types.ts";
import {
  championApiId,
  seasonPickAward,
  topScorerApiIds,
} from "./outcomes.ts";

function finalMatch(
  status: WireMatch["status"],
  winner: WireMatch["score"]["winner"]
): WireMatch {
  return {
    id: 1,
    utcDate: "2025-05-31T19:00:00Z",
    status,
    minute: status === "FINISHED" ? 90 : null,
    matchday: null,
    stage: "FINAL",
    lastUpdated: "2025-05-31T21:00:00Z",
    homeTeam: { id: 10, name: "Home", shortName: "Home", tla: "HOM", crest: null },
    awayTeam: { id: 20, name: "Away", shortName: "Away", tla: "AWY", crest: null },
    score: {
      winner,
      duration: "REGULAR",
      fullTime: { home: null, away: null },
      halfTime: { home: null, away: null },
    },
  };
}

function scorer(id: number, goals: number): WireScorer {
  return {
    player: { id, name: `Player ${id}`, position: "Offence" },
    team: { id: 1, name: "Club", shortName: "Club", tla: "CLU", crest: null },
    goals,
    assists: 0,
  };
}

describe("season outcome derivation", () => {
  it("does not expose a champion before the final is complete", () => {
    assert.equal(championApiId([finalMatch("TIMED", null)]), null);
  });

  it("uses the provider winner, including finals decided after 90 minutes", () => {
    const match = finalMatch("FINISHED", "AWAY_TEAM");
    match.score.duration = "PENALTY_SHOOTOUT";
    assert.equal(championApiId([match]), 20);
  });

  it("returns every player tied for the scoring lead", () => {
    assert.deepEqual(
      topScorerApiIds([scorer(1, 12), scorer(2, 12), scorer(3, 9)]),
      [1, 2]
    );
  });

  it("awards the snapshotted prices independently", () => {
    assert.deepEqual(
      seasonPickAward(
        {
          championTeamId: "outsider",
          topScorerFootballDataId: 2,
          championPickPoints: 85,
          scorerPickPoints: 24,
        },
        { championTeamId: "outsider", topScorerFootballDataIds: [1, 2] }
      ),
      { championPoints: 85, scorerPoints: 24 }
    );
  });

  it("awards zero for incorrect picks", () => {
    assert.deepEqual(
      seasonPickAward(
        {
          championTeamId: "club-a",
          topScorerFootballDataId: 3,
          championPickPoints: 10,
          scorerPickPoints: 12,
        },
        { championTeamId: "club-b", topScorerFootballDataIds: [1, 2] }
      ),
      { championPoints: 0, scorerPoints: 0 }
    );
  });
});
