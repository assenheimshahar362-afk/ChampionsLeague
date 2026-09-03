import type { Fixture, Team } from "@/lib/fixtures/types";

/**
 * The league-phase table, computed from results the app has already released.
 *
 * Deliberately NOT the provider's `/standings`. The app replays a finished
 * season on a compressed timeline, so the provider's table is the *final* one —
 * putting it on screen would tell a player who tops the group before they have
 * predicted a single match of it. Deriving the table from `public.fixtures`
 * instead means it can only ever know what settlement has already released,
 * which is exactly what the player knows.
 *
 * It also means there is no standings table to ingest, no second source to fall
 * out of step with the fixtures, and nothing to re-fetch when a result lands.
 *
 * Knockout rounds are excluded: a bracket is not a table. Only `league_phase`
 * fixtures count, which is the 36-team single table of the current format.
 */

export type StandingRow = {
  rank: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

/** League-phase points. Not the prediction game's scoring — the football's. */
const WIN = 3;
const DRAW = 1;

/**
 * Where a rank lands a club under the 36-team format.
 *
 *   1–8   through to the round of 16
 *   9–24  into the knockout play-off
 *   25–36 out of Europe
 */
export type Qualification = "direct" | "playoff" | "eliminated";

export function qualificationFor(rank: number): Qualification {
  if (rank <= 8) return "direct";
  if (rank <= 24) return "playoff";
  return "eliminated";
}

type Tally = Omit<StandingRow, "rank" | "goalDifference">;

function blank(team: Team): Tally {
  return {
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  };
}

/**
 * Builds the table from every league-phase club in the fixture list, applying
 * only scores that have already been released.
 *
 * Before the first match this produces the familiar all-zero table rather than
 * an empty screen. Equal rows are ordered by their localized display name.
 */
export function buildStandings(
  fixtures: Fixture[],
  locale: string = "en"
): StandingRow[] {
  const tallies = new Map<string, Tally>();
  const nameCollator = new Intl.Collator(locale === "he" ? "he-IL" : "en", {
    sensitivity: "base",
    numeric: true,
  });

  function tally(team: Team): Tally {
    const existing = tallies.get(team.id);
    if (existing) return existing;
    const fresh = blank(team);
    tallies.set(team.id, fresh);
    return fresh;
  }

  for (const fixture of fixtures) {
    if (fixture.stage !== "league_phase") continue;

    // Register both participants even when their score has not been released.
    // The complete schedule therefore supplies all 36 zeroed rows pre-season.
    const home = tally(fixture.homeTeam);
    const away = tally(fixture.awayTeam);

    // Settlement releases both goals together or neither, but this reads the
    // pair independently rather than trusting that invariant from here.
    if (fixture.homeGoals === null || fixture.awayGoals === null) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += fixture.homeGoals;
    home.goalsAgainst += fixture.awayGoals;
    away.goalsFor += fixture.awayGoals;
    away.goalsAgainst += fixture.homeGoals;

    if (fixture.homeGoals > fixture.awayGoals) {
      home.won += 1;
      away.lost += 1;
      home.points += WIN;
    } else if (fixture.homeGoals < fixture.awayGoals) {
      away.won += 1;
      home.lost += 1;
      away.points += WIN;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += DRAW;
      away.points += DRAW;
    }
  }

  return [...tallies.values()]
    .map((t) => ({ ...t, goalDifference: t.goalsFor - t.goalsAgainst }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        // Last resort so the order is stable across renders rather than
        // depending on which fixture happened to be ingested first. UEFA's real
        // tiebreakers run deeper than this (head-to-head, away goals, wins,
        // disciplinary points); with the top eight decided by them in real life
        // this is a display order, not a ruling.
        nameCollator.compare(a.team.shortName, b.team.shortName) ||
        a.team.id.localeCompare(b.team.id)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
