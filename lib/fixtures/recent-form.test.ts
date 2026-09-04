import assert from "node:assert/strict";
import test from "node:test";

import type { WireMatch, WireMatchesResponse } from "../football-data/types.ts";
import { recentMatchesFromResponse, recentMatchOutcome } from "./recent-form.ts";

function match(
  id: number,
  utcDate: string,
  status: WireMatch["status"] = "FINISHED",
  score: [number | null, number | null] = [2, 1]
): WireMatch {
  return {
    id,
    competition: { id: 1, name: "Domestic League", code: "DL" },
    utcDate,
    status,
    minute: status === "FINISHED" ? 90 : null,
    matchday: 1,
    stage: "REGULAR_SEASON",
    lastUpdated: utcDate,
    homeTeam: {
      id: 10,
      name: "Home FC",
      shortName: "Home",
      tla: "HOM",
      crest: "https://crests.football-data.org/10.png",
    },
    awayTeam: {
      id: 20,
      name: "Away FC",
      shortName: "Away",
      tla: "AWY",
      crest: "https://crests.football-data.org/20.png",
    },
    score: {
      winner: score[0] === score[1] ? "DRAW" : "HOME_TEAM",
      duration: "REGULAR",
      fullTime: { home: score[0], away: score[1] },
      halfTime: { home: 0, away: 0 },
    },
  };
}

test("keeps only completed results known before the predicted fixture", () => {
  const response: WireMatchesResponse = {
    filters: {},
    resultSet: { count: 4 },
    matches: [
      match(1, "2026-08-01T19:00:00Z"),
      match(2, "2026-08-20T19:00:00Z"),
      match(3, "2026-09-10T19:00:00Z"),
      match(4, "2026-08-25T19:00:00Z", "IN_PLAY"),
      match(5, "2026-08-24T19:00:00Z", "FINISHED", [null, null]),
    ],
  };

  assert.deepEqual(
    recentMatchesFromResponse(response, "2026-09-01T19:00:00Z").map(
      (item) => item.providerMatchId
    ),
    [2, 1]
  );
});

test("derives the selected team's outcome from either side", () => {
  const [result] = recentMatchesFromResponse(
    { filters: {}, resultSet: { count: 1 }, matches: [match(1, "2026-08-01T19:00:00Z")] },
    "2026-09-01T19:00:00Z"
  );

  assert.equal(recentMatchOutcome(result!, 10), "win");
  assert.equal(recentMatchOutcome(result!, 20), "loss");
  assert.equal(result!.homeTeamCrest, "https://crests.football-data.org/10.png");
  assert.equal(result!.awayTeamCrest, "https://crests.football-data.org/20.png");
});