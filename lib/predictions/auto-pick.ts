import type { Fixture } from "@/lib/fixtures/types";

export type MatchProbabilities = {
  home: number;
  draw: number;
  away: number;
};

const FALLBACK: MatchProbabilities = { home: 0.42, draw: 0.28, away: 0.3 };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function validProbability(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalize(probabilities: MatchProbabilities): MatchProbabilities {
  const total = probabilities.home + probabilities.draw + probabilities.away;
  if (!Number.isFinite(total) || total <= 0) return FALLBACK;
  return {
    home: probabilities.home / total,
    draw: probabilities.draw / total,
    away: probabilities.away / total,
  };
}

/**
 * Turns each club's pre-tournament title price into a head-to-head market.
 *
 * The logarithm is important: a 16% title chance against 1% describes a much
 * bigger gap than 16 percentage points. The scale keeps that gap plausible for
 * one football match, while the intercept reproduces the app's baseline home
 * advantage when two clubs are evenly rated.
 */
export function probabilitiesForAutoPick(fixture: Fixture): MatchProbabilities {
  const homeMarket = fixture.homeTeam.marketProbability;
  const awayMarket = fixture.awayTeam.marketProbability;

  if (validProbability(homeMarket) && validProbability(awayMarket)) {
    const strengthGap = Math.log(homeMarket / awayMarket);
    const draw = clamp(0.28 - Math.abs(strengthGap) * 0.02, 0.18, 0.28);
    const homeShare = 1 / (1 + Math.exp(-(0.35 + strengthGap * 0.55)));
    return normalize({
      home: (1 - draw) * homeShare,
      draw,
      away: (1 - draw) * (1 - homeShare),
    });
  }

  const forecast = fixture.forecast;
  if (
    validProbability(forecast?.home) &&
    validProbability(forecast.draw) &&
    validProbability(forecast.away)
  ) {
    return normalize({
      home: forecast.home,
      draw: forecast.draw,
      away: forecast.away,
    });
  }

  return FALLBACK;
}

function poisson(goals: number, expected: number) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return (Math.exp(-expected) * expected ** goals) / factorial;
}

/**
 * Draws an outcome using the market weights, then draws a scoreline from the
 * matching Poisson distribution. Slightly flattening the score weights keeps
 * plausible 2–1, 2–0 and 3–1 calls in play instead of collapsing almost every
 * favourite into the single modal score of 1–0.
 */
export function autoPredictionForFixture(
  fixture: Fixture,
  random: () => number = Math.random
) {
  const probabilities = probabilitiesForAutoPick(fixture);
  const outcomeDraw = clamp(random(), 0, 0.999999);
  const likelyOutcome =
    outcomeDraw < probabilities.home
      ? "home"
      : outcomeDraw < probabilities.home + probabilities.draw
        ? "draw"
        : "away";

  const strength = Math.log(
    (probabilities.home + 0.04) / (probabilities.away + 0.04)
  );
  const goalDifference = clamp(strength * 0.62, -2.1, 2.1);
  const totalGoals = 2.6 + Math.min(0.35, Math.abs(strength) * 0.08);
  const expectedHome = clamp((totalGoals + goalDifference) / 2, 0.25, 3.5);
  const expectedAway = clamp((totalGoals - goalDifference) / 2, 0.25, 3.5);

  const candidates: Array<{
    homeGoals: number;
    awayGoals: number;
    weight: number;
  }> = [];
  for (let homeGoals = 0; homeGoals <= 5; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 5; awayGoals += 1) {
      const outcome =
        homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";
      if (outcome !== likelyOutcome) continue;
      const likelihood =
        poisson(homeGoals, expectedHome) * poisson(awayGoals, expectedAway);
      candidates.push({
        homeGoals,
        awayGoals,
        // A temperature below 1 broadens the distribution without making
        // five-goal outliers as common as ordinary football scores.
        weight: likelihood ** 0.72,
      });
    }
  }

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let target = clamp(random(), 0, 0.999999) * totalWeight;
  for (const candidate of candidates) {
    target -= candidate.weight;
    if (target <= 0) {
      return {
        homeGoals: candidate.homeGoals,
        awayGoals: candidate.awayGoals,
      };
    }
  }

  const fallback = candidates.at(-1) ?? { homeGoals: 1, awayGoals: 1 };
  return { homeGoals: fallback.homeGoals, awayGoals: fallback.awayGoals };
}
