export const MAX_PLAYER_CANDIDATES = 50;

const MAX_PICK_POINTS = 200;
const TEAM_MIN_POINTS = 4;
const PLAYER_MIN_POINTS = 5;
const TEAM_TEMPERATURE = 1.6;

export type TeamCandidateInput = {
  teamId: number;
  strength: number;
};

export type RankedTeamCandidate = TeamCandidateInput & {
  impliedProbability: number;
  pickPoints: number;
  rank: number;
};

export type PlayerCandidateInput = {
  footballDataId: number;
  name: string;
  teamApiId: number;
  position: string | null;
  goals: number;
  assists: number;
  rating: number | null;
  scorerRank: number | null;
  assistRank: number | null;
};

export type RankedPlayerCandidate = PlayerCandidateInput & {
  impliedProbability: number;
  pickPoints: number;
  rank: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointsForProbability(probability: number, minimum: number): number {
  return clamp(Math.round(1 / probability), minimum, MAX_PICK_POINTS);
}

/**
 * Turns relative team strength into a tournament market.
 *
 * Softmax makes every probability positive and guarantees the field sums to
 * one. The reciprocal is deliberately odds-like: a 10% favourite pays roughly
 * 10 points, while a 1% outsider pays roughly 100.
 */
export function rankTeamCandidates(
  candidates: TeamCandidateInput[]
): RankedTeamCandidate[] {
  if (candidates.length === 0) return [];

  const maxStrength = Math.max(...candidates.map((c) => c.strength));
  const weighted = candidates.map((candidate) => ({
    candidate,
    weight: Math.exp((candidate.strength - maxStrength) * TEAM_TEMPERATURE),
  }));
  const total = weighted.reduce((sum, row) => sum + row.weight, 0);

  return weighted
    .map(({ candidate, weight }) => {
      const impliedProbability = weight / total;
      return {
        ...candidate,
        impliedProbability,
        pickPoints: pointsForProbability(impliedProbability, TEAM_MIN_POINTS),
        rank: 0,
      };
    })
    .sort(
      (a, b) =>
        b.impliedProbability - a.impliedProbability || a.teamId - b.teamId
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function playerSignal(candidate: PlayerCandidateInput): number {
  const rating = candidate.rating ?? 6;
  const scorerRankSignal = candidate.scorerRank
    ? Math.max(0, 21 - candidate.scorerRank) * 0.65
    : 0;
  const assistRankSignal = candidate.assistRank
    ? Math.max(0, 21 - candidate.assistRank) * 0.25
    : 0;

  return (
    1 +
    candidate.goals * 1.5 +
    candidate.assists * 0.6 +
    Math.max(0, rating - 6) * 2 +
    scorerRankSignal +
    assistRankSignal
  );
}

/** Builds one ranked, odds-like list from the provider's scorer/assist lists. */
export function rankPlayerCandidates(
  candidates: PlayerCandidateInput[]
): RankedPlayerCandidate[] {
  if (candidates.length === 0) return [];

  const weighted = candidates.map((candidate) => ({
    candidate,
    // Squaring separates the genuine favourites without letting one player
    // swallow the whole probability field.
    weight: playerSignal(candidate) ** 2,
  }));
  const total = weighted.reduce((sum, row) => sum + row.weight, 0);

  return weighted
    .map(({ candidate, weight }) => {
      const impliedProbability = weight / total;
      return {
        ...candidate,
        impliedProbability,
        pickPoints: pointsForProbability(impliedProbability, PLAYER_MIN_POINTS),
        rank: 0,
      };
    })
    .sort(
      (a, b) =>
        b.impliedProbability - a.impliedProbability ||
        a.name.localeCompare(b.name) ||
        a.footballDataId - b.footballDataId
    )
    .slice(0, MAX_PLAYER_CANDIDATES)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
