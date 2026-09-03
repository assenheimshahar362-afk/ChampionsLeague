/**
 * Domain types for fixtures.
 *
 * These describe the app's own model, not a provider's wire format. The
 * ingestion layer (Milestone 3) adapts one to the other; nothing downstream of
 * here should know what the provider's JSON looks like.
 */

export type Outcome = "home" | "draw" | "away";

export type Stage =
  | "league_phase"
  | "playoff"
  | "r16"
  | "qf"
  | "sf"
  | "final";

export type FixtureStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled";

export type Team = {
  id: string;
  name: string;
  shortName: string;
  /** Three-letter code used in tight mobile layouts. */
  code: string;
  /** Club colour, used by the placeholder crest until real logos land (M3). */
  color: string;
  logoUrl: string | null;
  /** Pre-tournament title probability, used as a team-strength prior. */
  marketProbability?: number | null;
};

export type Fixture = {
  id: string;
  footballDataId?: number;
  season?: number;
  stage: Stage;
  /** Round label exactly as the provider gives it. Never re-derived. */
  round: string;
  kickoffAt: string; // ISO 8601, always UTC
  venue: string | null;
  venueDetails?: {
    city: string | null;
    address: string | null;
    capacity: number | null;
    surface: string | null;
    imageUrl: string | null;
  };
  referee?: string | null;
  attendance?: number | null;
  homeTeam: Team;
  awayTeam: Team;
  status: FixtureStatus;
  homeGoals: number | null;
  awayGoals: number | null;
  elapsedMinutes: number | null;
  wentToExtraTime?: boolean;
  forecast?: {
    home: number | null;
    draw: number | null;
    away: number | null;
  };
  /** Points awarded for calling each possible match outcome. */
  outcomePoints: Record<Outcome, number>;
};

/**
 * A user's prediction for one fixture.
 *
 * A scoreline and nothing else. The fixture determines what its winning,
 * drawing, or losing outcome is worth; an exact scoreline doubles that award.
 */
export type Prediction = {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
};

export function isInPlay(fixture: Fixture): boolean {
  return fixture.status === "live" || fixture.status === "halftime";
}
