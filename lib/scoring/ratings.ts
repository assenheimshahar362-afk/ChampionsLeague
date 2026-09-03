import type { Outcome } from "@/lib/fixtures/types";

/**
 * Ratings-based outcome probabilities — the §6.2 fallback for when no odds
 * exist.
 *
 * The free plan reports `coverage.odds: false` for every season it exposes, and
 * `/predictions` returns nothing for finished fixtures, so a replayed season has
 * no market signal at all. Scoring no longer weighs a fixture by how likely its
 * outcome was, so nothing here awards points — the snapshot is kept because it
 * is the only strength signal the app has, and a leaderboard or a "toughest
 * call of the round" readout will want it.
 *
 * Ratings are derived from match results the app already holds rather than from
 * the standings endpoint. That is deliberate: the standings snapshot is the
 * FINAL table, and using it to rate a September fixture would leak the rest of
 * the season into the estimate made for a September fixture. Feeding this only
 * the matches played before a given kickoff keeps the rating honest.
 *
 * Pure and I/O-free, so ingest, settlement and any client projection agree.
 */

export type PlayedMatch = {
  homeTeamId: string;
  awayTeamId: string;
  /** Regulation-time score (§6.3). */
  homeGoals: number;
  awayGoals: number;
  kickoffAt: string;
};

export type Rating = {
  played: number;
  /**
   * Roughly "goals per game better than an average side in this competition".
   * Zero is average; positive is stronger. Shrunk toward zero while a team has
   * played only a few matches.
   */
  strength: number;
};

/* ------------------------------------------------------------- parameters -- */

/**
 * Matches lose influence as they age, so a team in form is rated on its form.
 * 0.85 per match back means a side's five most recent games carry the bulk of
 * the weight without older results dropping out entirely.
 */
const RECENCY_DECAY = 0.85;

/**
 * Shrinkage prior. With no matches played a team rates dead average; the pull
 * toward average fades as evidence accumulates. Three is deliberately strong —
 * an 8-match league phase never accumulates enough games for a hot start to be
 * taken fully at face value.
 */
const PRIOR_MATCHES = 3;

/** Goals per game are the sharper signal; points per game stabilise it. */
const GOAL_DIFF_WEIGHT = 0.6;
const POINTS_WEIGHT = 0.8;

/** Home advantage, in the same goals-per-game units as `strength`. */
const HOME_ADVANTAGE = 0.35;

/** Logistic steepness converting a strength gap into a win share. */
const LOGISTIC_K = 1.1;

/**
 * Draw likelihood between evenly matched sides, and how fast it falls away as
 * the gap widens. ~26% for a coin-flip tie is in line with knockout football.
 */
const DRAW_BASE = 0.26;
const DRAW_DECAY = 0.9;

/**
 * Used when neither side has played: the competition's long-run home/draw/away
 * split. Not a guess about these two teams — an explicit statement that we know
 * nothing yet.
 */
export type OutcomeProbabilities = Record<Outcome, number>;

const BASELINE: OutcomeProbabilities = { home: 0.42, draw: 0.28, away: 0.3 };

/* ---------------------------------------------------------------- ratings -- */

type Accumulator = {
  weight: number;
  weightedGoalDiff: number;
  weightedPoints: number;
  played: number;
};

function pointsFor(scored: number, conceded: number): number {
  if (scored > conceded) return 3;
  if (scored < conceded) return 0;
  return 1; // draw
}

/**
 * Rates every team appearing in `matches`.
 *
 * Pass only matches that had finished at the moment being rated — see
 * `ratingsAsOf`.
 */
export function computeRatings(matches: PlayedMatch[]): Map<string, Rating> {
  // Newest first. Recency is counted per team, NOT by position in this list:
  // decaying on the global index would raise 0.85 to the power of a team's
  // offset among every match in the competition, driving all but the most
  // recent handful to ~0 and collapsing each rating onto whichever fixture
  // happened to fall latest overall.
  const ordered = [...matches].sort(
    (a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime()
  );

  const acc = new Map<string, Accumulator>();

  const bump = (teamId: string, scored: number, conceded: number) => {
    const current = acc.get(teamId) ?? {
      weight: 0,
      weightedGoalDiff: 0,
      weightedPoints: 0,
      played: 0,
    };

    // How many of this team's own matches are more recent than this one.
    const weight = RECENCY_DECAY ** current.played;

    current.weight += weight;
    current.weightedGoalDiff += (scored - conceded) * weight;
    current.weightedPoints += pointsFor(scored, conceded) * weight;
    current.played += 1;

    acc.set(teamId, current);
  };

  for (const match of ordered) {
    bump(match.homeTeamId, match.homeGoals, match.awayGoals);
    bump(match.awayTeamId, match.awayGoals, match.homeGoals);
  }

  const ratings = new Map<string, Rating>();

  for (const [teamId, a] of acc) {
    const goalDiffPerGame = a.weight > 0 ? a.weightedGoalDiff / a.weight : 0;
    const pointsPerGame = a.weight > 0 ? a.weightedPoints / a.weight : 0;

    const raw =
      goalDiffPerGame * GOAL_DIFF_WEIGHT +
      // 1.5 points per game is the competition's midpoint, so this centres on 0.
      (pointsPerGame - 1.5) * POINTS_WEIGHT;

    // Shrink toward average while the sample is thin.
    const confidence = a.played / (a.played + PRIOR_MATCHES);

    ratings.set(teamId, { played: a.played, strength: raw * confidence });
  }

  return ratings;
}

/** Ratings from only those matches that had kicked off before `cutoff`. */
export function ratingsAsOf(
  matches: PlayedMatch[],
  cutoff: Date
): Map<string, Rating> {
  const cutoffMs = cutoff.getTime();
  return computeRatings(
    matches.filter((m) => new Date(m.kickoffAt).getTime() < cutoffMs)
  );
}

/* ---------------------------------------------------------- probabilities -- */

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Converts two ratings into outcome probabilities.
 *
 * Draw probability is derived first, from how close the sides are, and the
 * remainder is split between home and away by a logistic on the strength gap.
 * Deriving it in that order is what guarantees the three sum to exactly 1,
 * so the three always sum to exactly 1.
 */
export function probabilitiesFrom(
  homeRating: Rating | undefined,
  awayRating: Rating | undefined
): OutcomeProbabilities {
  // Neither side has a match behind them: state the baseline rather than
  // pretending the model knows something.
  if (!homeRating?.played && !awayRating?.played) return { ...BASELINE };

  const gap =
    (homeRating?.strength ?? 0) - (awayRating?.strength ?? 0) + HOME_ADVANTAGE;

  const draw = DRAW_BASE * Math.exp(-Math.abs(gap) * DRAW_DECAY);
  const homeShare = logistic(LOGISTIC_K * gap);

  const decisive = 1 - draw;

  return {
    home: decisive * homeShare,
    draw,
    away: decisive * (1 - homeShare),
  };
}

/** Convenience: probabilities for one fixture, rated on prior results only. */
export function probabilitiesAsOf(
  matches: PlayedMatch[],
  kickoff: Date,
  homeTeamId: string,
  awayTeamId: string
): OutcomeProbabilities {
  const ratings = ratingsAsOf(matches, kickoff);
  return probabilitiesFrom(ratings.get(homeTeamId), ratings.get(awayTeamId));
}
