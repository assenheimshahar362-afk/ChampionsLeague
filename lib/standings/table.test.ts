import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildStandings, qualificationFor } from "./table.ts";
import type { Fixture, Stage, Team } from "../fixtures/types.ts";

function team(id: string, name: string = id): Team {
  return {
    id,
    name,
    shortName: name,
    code: id.slice(0, 3).toUpperCase(),
    color: "#123456",
    logoUrl: null,
  };
}

let seq = 0;
function fixture(
  home: string,
  away: string,
  homeGoals: number | null,
  awayGoals: number | null,
  stage: Stage = "league_phase"
): Fixture {
  return {
    id: `f${seq++}`,
    stage,
    round: "League Stage - 1",
    kickoffAt: "2024-09-18T19:00:00.000Z",
    venue: null,
    homeTeam: team(home),
    awayTeam: team(away),
    status: homeGoals === null ? "scheduled" : "finished",
    homeGoals,
    awayGoals,
    elapsedMinutes: null,
    outcomePoints: { home: 4, draw: 8, away: 6 },
  };
}

describe("buildStandings", () => {
  it("shows every scheduled club with zeroes before anything has been played", () => {
    const table = buildStandings([fixture("Roma", "Ajax", null, null)]);

    assert.deepEqual(
      table.map((row) => row.team.id),
      ["Ajax", "Roma"]
    );
    assert.ok(
      table.every(
        (row) =>
          row.played === 0 &&
          row.goalDifference === 0 &&
          row.points === 0
      )
    );
  });

  it("awards 3 for a win and 1 each for a draw", () => {
    const table = buildStandings([
      fixture("Ajax", "Roma", 2, 0),
      fixture("Bruges", "Celtic", 1, 1),
    ]);

    const by = Object.fromEntries(table.map((r) => [r.team.id, r]));
    assert.equal(by.Ajax!.points, 3);
    assert.equal(by.Ajax!.won, 1);
    assert.equal(by.Roma!.points, 0);
    assert.equal(by.Roma!.lost, 1);
    assert.equal(by.Bruges!.points, 1);
    assert.equal(by.Celtic!.drawn, 1);
  });

  it("accumulates goals from both sides of a fixture", () => {
    const [row] = buildStandings([
      fixture("Ajax", "Roma", 3, 1),
      fixture("Bruges", "Ajax", 0, 2),
    ]).filter((r) => r.team.id === "Ajax");

    assert.equal(row!.played, 2);
    assert.equal(row!.goalsFor, 5);
    assert.equal(row!.goalsAgainst, 1);
    assert.equal(row!.goalDifference, 4);
    assert.equal(row!.points, 6);
  });

  it("ignores knockout fixtures — a bracket is not a table", () => {
    const table = buildStandings([
      fixture("Ajax", "Roma", 2, 0, "r16"),
      fixture("Ajax", "Celtic", 1, 0, "final"),
    ]);
    assert.deepEqual(table, []);
  });

  it("ignores a fixture whose result has not been released", () => {
    const table = buildStandings([
      fixture("Ajax", "Roma", 1, 0),
      fixture("Ajax", "Celtic", null, null),
    ]);
    assert.equal(table.find((r) => r.team.id === "Ajax")!.played, 1);
    assert.equal(table.find((r) => r.team.id === "Celtic")!.played, 0);
  });

  it("separates equal points on goal difference, then goals scored", () => {
    // All three finish on 3 points. Ajax +3, Bruges +1 scoring 4, Celtic +1
    // scoring 2 — so the order is Ajax, Bruges, Celtic.
    const table = buildStandings([
      fixture("Ajax", "Roma", 3, 0),
      fixture("Bruges", "Porto", 4, 3),
      fixture("Celtic", "Lens", 2, 1),
    ]);

    assert.deepEqual(
      table.slice(0, 3).map((r) => r.team.id),
      ["Ajax", "Bruges", "Celtic"]
    );
    assert.deepEqual(
      table.slice(0, 3).map((r) => r.rank),
      [1, 2, 3]
    );
  });

  it("orders identical records by name, so the table never reshuffles itself", () => {
    const once = buildStandings([
      fixture("Zurich", "Roma", 1, 0),
      fixture("Ajax", "Porto", 1, 0),
    ]);
    const twice = buildStandings([
      fixture("Ajax", "Porto", 1, 0),
      fixture("Zurich", "Roma", 1, 0),
    ]);

    assert.deepEqual(
      once.map((r) => r.team.id),
      twice.map((r) => r.team.id)
    );
    assert.equal(once[0]!.team.id, "Ajax");
  });

  it("orders all-zero rows by the displayed Hebrew name", () => {
    const first = fixture("last", "middle", null, null);
    first.homeTeam = team("last", "תל אביב");
    first.awayTeam = team("middle", "ביתר");
    const second = fixture("first", "last", null, null);
    second.homeTeam = team("first", "אריאל");
    second.awayTeam = team("last", "תל אביב");

    assert.deepEqual(
      buildStandings([first, second], "he").map((row) => row.team.id),
      ["first", "middle", "last"]
    );
  });
});

describe("qualificationFor", () => {
  it("splits the 36 into the three bands of the current format", () => {
    assert.equal(qualificationFor(1), "direct");
    assert.equal(qualificationFor(8), "direct");
    assert.equal(qualificationFor(9), "playoff");
    assert.equal(qualificationFor(24), "playoff");
    assert.equal(qualificationFor(25), "eliminated");
    assert.equal(qualificationFor(36), "eliminated");
  });
});
