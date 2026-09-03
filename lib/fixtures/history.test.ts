import assert from "node:assert/strict";
import test from "node:test";

import { buildFixtureHistory } from "./history.ts";
import type { Fixture, Team } from "./types.ts";

const teams = new Map<string, Team>();
function team(id: string): Team {
  const existing = teams.get(id);
  if (existing) return existing;
  const value = {
    id,
    name: id,
    shortName: id,
    code: id.slice(0, 3).toUpperCase(),
    color: "#123456",
    logoUrl: null,
  };
  teams.set(id, value);
  return value;
}

function fixture(
  id: string,
  home: string,
  away: string,
  day: number,
  status: Fixture["status"] = "finished"
): Fixture {
  return {
    id,
    stage: "league_phase",
    round: "League Stage - 1",
    kickoffAt: `2026-08-${String(day).padStart(2, "0")}T19:00:00.000Z`,
    venue: null,
    homeTeam: team(home),
    awayTeam: team(away),
    status,
    homeGoals: status === "finished" ? 2 : null,
    awayGoals: status === "finished" ? 1 : null,
    elapsedMinutes: status === "finished" ? 90 : null,
    outcomePoints: { home: 4, draw: 8, away: 6 },
  };
}

test("history contains only released fixtures before the selected match", () => {
  const current = fixture("current", "A", "B", 20, "scheduled");
  const previousMeeting = fixture("h2h", "B", "A", 10);
  const homeRecent = fixture("home", "A", "C", 12);
  const hidden = fixture("hidden", "A", "B", 18, "scheduled");
  const future = fixture("future", "A", "B", 25);

  const history = buildFixtureHistory(
    [current, previousMeeting, homeRecent, hidden, future],
    current
  );

  assert.deepEqual(history.headToHead.map((row) => row.id), ["h2h"]);
  assert.deepEqual(history.homeRecent.map((row) => row.id), ["home", "h2h"]);
  assert.deepEqual(history.awayRecent.map((row) => row.id), ["h2h"]);
});
