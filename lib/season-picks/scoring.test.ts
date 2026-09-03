import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_PLAYER_CANDIDATES,
  rankPlayerCandidates,
  rankTeamCandidates,
  type PlayerCandidateInput,
} from "./scoring.ts";

describe("rankTeamCandidates", () => {
  it("prices favourites below outsiders and sums to one", () => {
    const ranked = rankTeamCandidates([
      { teamId: 1, strength: 1.4 },
      { teamId: 2, strength: 0.2 },
      { teamId: 3, strength: -1.1 },
    ]);

    assert.deepEqual(
      ranked.map((row) => row.teamId),
      [1, 2, 3]
    );
    assert.ok(ranked[0].pickPoints < ranked[2].pickPoints);
    assert.ok(
      Math.abs(
        ranked.reduce((sum, row) => sum + row.impliedProbability, 0) - 1
      ) < 1e-12
    );
  });

  it("gives an equal field equal prices", () => {
    const ranked = rankTeamCandidates(
      Array.from({ length: 36 }, (_, index) => ({
        teamId: index + 1,
        strength: 0,
      }))
    );

    assert.ok(ranked.every((row) => row.pickPoints === 36));
  });
});

describe("rankPlayerCandidates", () => {
  const player = (
    id: number,
    goals: number,
    scorerRank: number
  ): PlayerCandidateInput => ({
    footballDataId: id,
    name: `Player ${id}`,
    teamApiId: id,
    position: "Forward",
    goals,
    assists: 0,
    rating: 7,
    scorerRank,
    assistRank: null,
  });

  it("makes the leading scorer cheaper than the long shot", () => {
    const ranked = rankPlayerCandidates([
      player(1, 12, 1),
      player(2, 7, 8),
      player(3, 3, 18),
    ]);

    assert.equal(ranked[0].footballDataId, 1);
    assert.ok(ranked[0].pickPoints < ranked[2].pickPoints);
  });

  it("caps the candidate pool", () => {
    const ranked = rankPlayerCandidates(
      Array.from({ length: 70 }, (_, index) => player(index + 1, 70 - index, 1))
    );

    assert.equal(ranked.length, MAX_PLAYER_CANDIDATES);
  });
});
