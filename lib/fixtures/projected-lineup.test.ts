import assert from "node:assert/strict";
import test from "node:test";

import type { WireMatch } from "../football-data/types.ts";
import { projectedLineupFromMatch } from "./projected-lineup.ts";

function detailedMatch(): WireMatch {
  return {
    id: 900,
    utcDate: "2026-08-30T19:00:00Z",
    status: "FINISHED",
    minute: 90,
    matchday: 3,
    stage: "REGULAR_SEASON",
    lastUpdated: "2026-08-30T21:00:00Z",
    homeTeam: {
      id: 10,
      name: "Home FC",
      shortName: "Home",
      tla: "HOM",
      crest: null,
      formation: "4-3-3",
      lineup: [
        { id: 1, name: "Home Keeper", position: "Goalkeeper", shirtNumber: 1 },
        { id: 2, name: "Home Defender", position: "Defence", shirtNumber: 2 },
      ],
    },
    awayTeam: {
      id: 20,
      name: "Away FC",
      shortName: "Away",
      tla: "AWY",
      crest: null,
      formation: "3-5-2",
      lineup: [
        { id: 8, name: "Away Midfielder", position: "Midfield", shirtNumber: 8 },
      ],
    },
    score: {
      winner: "HOME_TEAM",
      duration: "REGULAR",
      fullTime: { home: 2, away: 0 },
      halfTime: { home: 1, away: 0 },
    },
  };
}

test("projects the requested team's starters and source context", () => {
  const lineup = projectedLineupFromMatch(detailedMatch(), 10);

  assert.equal(lineup?.formation, "4-3-3");
  assert.equal(lineup?.sourceOpponent, "Away");
  assert.deepEqual(lineup?.players.map((player) => player.name), [
    "Home Keeper",
    "Home Defender",
  ]);
});

test("does not return the opponent lineup for an unknown team", () => {
  assert.equal(projectedLineupFromMatch(detailedMatch(), 99), null);
});

test("preserves every tactical line in a 4-2-3-1 formation", () => {
  const match = detailedMatch();
  match.homeTeam.formation = "4-2-3-1";
  match.homeTeam.lineup = [
    { id: 1, name: "GK", position: "Goalkeeper", shirtNumber: 1 },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: index + 2,
      name: `Outfield ${index + 1}`,
      position: null,
      shirtNumber: index + 2,
    })),
  ];

  const lineup = projectedLineupFromMatch(match, 10);

  assert.deepEqual(
    lineup?.players.map((player) => player.formationRow),
    [0, 1, 1, 1, 1, 2, 2, 3, 3, 3, 4]
  );
});