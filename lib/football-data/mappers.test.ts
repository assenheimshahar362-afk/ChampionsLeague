import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  codeFor,
  mapStatus,
  normalizeTeamName,
  predictionScore,
  regulationScore,
  roundForMatch,
  stageFromProvider,
  toFixtureProviderDetails,
  toFixtureResultRow,
} from "./mappers.ts";
import type { WireMatch } from "./types.ts";

function match(overrides: Partial<WireMatch> = {}): WireMatch {
  return {
    id: 498123,
    utcDate: "2026-09-16T19:00:00Z",
    status: "IN_PLAY",
    minute: 67,
    injuryTime: null,
    attendance: 78_000,
    venue: "Estadio Santiago Bernabéu",
    matchday: 1,
    stage: "LEAGUE_STAGE",
    lastUpdated: "2026-09-16T20:25:00Z",
    homeTeam: {
      id: 86,
      name: "Real Madrid CF",
      shortName: "Real Madrid",
      tla: "RMA",
      crest: "https://crests.football-data.org/86.svg",
      formation: "4-3-3",
      lineup: [{ id: 1, name: "Keeper", position: "Goalkeeper", shirtNumber: 1 }],
      bench: [],
      statistics: { ball_possession: 54, shots: 12 },
    },
    awayTeam: {
      id: 65,
      name: "Manchester City FC",
      shortName: "Man City",
      tla: "MCI",
      crest: "https://crests.football-data.org/65.svg",
      statistics: { ball_possession: 46, shots: 8 },
    },
    score: {
      winner: "HOME_TEAM",
      duration: "REGULAR",
      fullTime: { home: 2, away: 1 },
      halfTime: { home: 1, away: 1 },
    },
    goals: [{
      minute: 61,
      injuryTime: null,
      type: "REGULAR",
      team: { id: 86, name: "Real Madrid CF" },
      scorer: { id: 9, name: "Striker" },
      assist: { id: 10, name: "Winger" },
      score: { home: 2, away: 1 },
    }],
    bookings: [],
    substitutions: [],
    referees: [{ id: 5, name: "Referee", type: "REFEREE", nationality: null }],
    ...overrides,
  };
}

describe("Football-Data mappers", () => {
  it("maps live statuses and Champions League stages", () => {
    assert.equal(mapStatus("IN_PLAY"), "live");
    assert.equal(mapStatus("PAUSED"), "halftime");
    assert.equal(mapStatus("FINISHED"), "finished");
    assert.equal(stageFromProvider("LEAGUE_STAGE"), "league_phase");
    assert.equal(stageFromProvider("QUALIFICATION_ROUND_3"), null);
    assert.equal(roundForMatch(match()), "League Stage - 1");
  });

  it("includes knockout extra time in settlement but excludes shootout kicks", () => {
    const extraTime = match({
      status: "FINISHED",
      stage: "SEMI_FINALS",
      matchday: null,
      score: {
        winner: "HOME_TEAM",
        duration: "PENALTY_SHOOTOUT",
        fullTime: { home: 4, away: 3 },
        halfTime: { home: 1, away: 1 },
        regularTime: { home: 3, away: 3 },
        extraTime: { home: 1, away: 0 },
        penalties: { home: 5, away: 4 },
      },
    });
    assert.deepEqual(regulationScore(extraTime), { home: 3, away: 3 });
    assert.deepEqual(predictionScore(extraTime), { home: 4, away: 3 });
    const row = toFixtureResultRow(extraTime);
    assert.equal(row.home_goals, 4);
    assert.equal(row.away_goals, 3);
    assert.equal(row.went_to_extra_time, true);
  });

  it("maps optional deep-data lineups, statistics and events", () => {
    const details = toFixtureProviderDetails(match());
    assert.equal(details.providerStatus, "live");
    assert.equal(details.lineups.length, 1);
    assert.equal(details.lineups[0]?.starters[0]?.name, "Keeper");
    assert.equal(details.statistics.length, 2);
    assert.equal(details.events[0]?.type, "Goal");
  });

  it("normalizes legacy and new provider team names for migration", () => {
    assert.equal(
      normalizeTeamName("FC Bayern München"),
      normalizeTeamName("Bayern Munchen")
    );
    assert.equal(normalizeTeamName("RB Leipzig"), normalizeTeamName("Leipzig"));
    assert.equal(normalizeTeamName("LOSC Lille"), normalizeTeamName("Lille OSC"));
    assert.equal(codeFor("Liverpool FC", "LIV"), "LIV");
  });
});
