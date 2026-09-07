export type MatchResult = {
  date: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  venue: "home" | "away";
};

export type PredictionSource = {
  competition: string;
  fixture: {
    kickoffAt: string;
    stage: string;
    round: string;
    venue: string | null;
    homeTeam: string;
    awayTeam: string;
  };
  modelProbabilities: {
    home: number | null;
    draw: number | null;
    away: number | null;
  };
  recentResults: {
    homeTeam: MatchResult[];
    awayTeam: MatchResult[];
  };
};

export type CalculatedPrediction = {
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  confidence: number;
  summaryEn: string;
  summaryHe: string;
  keyFactorsEn: [string, string, string];
  keyFactorsHe: [string, string, string];
};

const BASELINE = { home: 0.42, draw: 0.28, away: 0.3 };
const PRIOR_WEIGHT = 0.75;
const FORM_WEIGHT = 1 - PRIOR_WEIGHT;
const RECENCY_DECAY = 0.85;
const HOME_ADVANTAGE = 0.2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedPrior(source: PredictionSource) {
  const values = source.modelProbabilities;
  if (
    values.home === null ||
    values.draw === null ||
    values.away === null ||
    values.home < 0 ||
    values.draw < 0 ||
    values.away < 0
  ) {
    return BASELINE;
  }

  const total = values.home + values.draw + values.away;
  if (total <= 0) return BASELINE;
  return {
    home: values.home / total,
    draw: values.draw / total,
    away: values.away / total,
  };
}

function scoreForTeam(match: MatchResult): { scored: number; conceded: number } | null {
  const parts = match.score.split("-").map(Number);
  if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value))) return null;
  return match.venue === "home"
    ? { scored: parts[0]!, conceded: parts[1]! }
    : { scored: parts[1]!, conceded: parts[0]! };
}

/** A -1..1 rating using recency-weighted points (65%) and goal difference (35%). */
export function recentFormRating(matches: MatchResult[]): number {
  let weightedRating = 0;
  let totalWeight = 0;

  matches.slice(0, 5).forEach((match, index) => {
    const score = scoreForTeam(match);
    if (!score) return;
    const points = score.scored > score.conceded ? 3 : score.scored === score.conceded ? 1 : 0;
    const pointsRating = (points - 1.5) / 1.5;
    const goalRating = clamp(score.scored - score.conceded, -3, 3) / 3;
    const weight = RECENCY_DECAY ** index;
    weightedRating += (pointsRating * 0.65 + goalRating * 0.35) * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedRating / totalWeight : 0;
}

function formProbabilities(homeForm: number, awayForm: number) {
  const gap = homeForm - awayForm + HOME_ADVANTAGE;
  const draw = 0.26 * Math.exp(-Math.abs(gap) * 0.9);
  const homeShare = 1 / (1 + Math.exp(-1.1 * gap));
  return {
    home: (1 - draw) * homeShare,
    draw,
    away: (1 - draw) * (1 - homeShare),
  };
}

function integerPercentages(values: number[]): [number, number, number] {
  const exact = values.map((value) => value * 100);
  const rounded = exact.map(Math.floor);
  const remaining = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - rounded[index]! }))
    .sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; index < remaining; index += 1) {
    rounded[order[index]!.index] += 1;
  }
  return [rounded[0]!, rounded[1]!, rounded[2]!];
}

function poisson(goals: number, expected: number): number {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return (Math.exp(-expected) * expected ** goals) / factorial;
}

function predictedScore(home: number, draw: number, away: number): [number, number] {
  const likelyOutcome = home >= draw && home >= away ? "home" : away >= draw ? "away" : "draw";
  const strength = Math.log((home + 0.04) / (away + 0.04));
  const goalDifference = clamp(strength * 0.62, -2.1, 2.1);
  const totalGoals = 2.6 + Math.min(0.35, Math.abs(strength) * 0.08);
  const expectedHome = clamp((totalGoals + goalDifference) / 2, 0.25, 3.5);
  const expectedAway = clamp((totalGoals - goalDifference) / 2, 0.25, 3.5);
  let best: [number, number, number] = [1, 1, -1];

  for (let homeGoals = 0; homeGoals <= 6; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 6; awayGoals += 1) {
      const outcome = homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";
      if (outcome !== likelyOutcome) continue;
      const likelihood = poisson(homeGoals, expectedHome) * poisson(awayGoals, expectedAway);
      if (likelihood > best[2]) best = [homeGoals, awayGoals, likelihood];
    }
  }

  return [best[0], best[1]];
}

export function calculatePrediction(source: PredictionSource): CalculatedPrediction {
  const prior = normalizedPrior(source);
  const homeMatches = source.recentResults.homeTeam.slice(0, 5);
  const awayMatches = source.recentResults.awayTeam.slice(0, 5);
  const homeForm = recentFormRating(homeMatches);
  const awayForm = recentFormRating(awayMatches);
  const hasForm = homeMatches.length > 0 || awayMatches.length > 0;
  const form = formProbabilities(homeForm, awayForm);
  const formWeight = hasForm ? FORM_WEIGHT : 0;
  const priorWeight = 1 - formWeight;
  const probabilities = {
    home: prior.home * priorWeight + form.home * formWeight,
    draw: prior.draw * priorWeight + form.draw * formWeight,
    away: prior.away * priorWeight + form.away * formWeight,
  };
  const [homePercent, drawPercent, awayPercent] = integerPercentages([
    probabilities.home,
    probabilities.draw,
    probabilities.away,
  ]);
  const [homeGoals, awayGoals] = predictedScore(
    probabilities.home,
    probabilities.draw,
    probabilities.away
  );
  const sampleSize = Math.min(10, homeMatches.length + awayMatches.length);
  const ordered = [probabilities.home, probabilities.draw, probabilities.away].sort(
    (left, right) => right - left
  );
  const confidence = Math.round(
    clamp(45 + sampleSize * 2.5 + (ordered[0]! - ordered[1]!) * 30, 45, 88)
  );
  const favourite =
    homePercent >= drawPercent && homePercent >= awayPercent
      ? source.fixture.homeTeam
      : awayPercent >= drawPercent
        ? source.fixture.awayTeam
        : null;
  const callEn = favourite ? `${favourite} has the highest win probability` : "A draw is the most likely outcome";
  const callHe = favourite ? `ל${favourite} סיכוי הניצחון הגבוה ביותר` : "תיקו הוא התוצאה הסבירה ביותר";

  return {
    predictedHomeGoals: homeGoals,
    predictedAwayGoals: awayGoals,
    homeWinProbability: homePercent,
    drawProbability: drawPercent,
    awayWinProbability: awayPercent,
    confidence,
    summaryEn: `${callEn}. The projected score is ${homeGoals}-${awayGoals}, combining the pre-match strength model with recent form.`,
    summaryHe: `${callHe}. התוצאה המשוערת היא ${homeGoals}-${awayGoals}, בשילוב מודל הכוחות טרום המשחק והכושר האחרון.`,
    keyFactorsEn: [
      `Pre-match strength prior: ${Math.round(prior.home * 100)}% / ${Math.round(prior.draw * 100)}% / ${Math.round(prior.away * 100)}%`,
      `Recent form: ${homeMatches.length} ${source.fixture.homeTeam} and ${awayMatches.length} ${source.fixture.awayTeam} matches`,
      "Home advantage and recency decay are included in the calculation",
    ],
    keyFactorsHe: [
      `מודל הכוחות: ${Math.round(prior.home * 100)}% / ${Math.round(prior.draw * 100)}% / ${Math.round(prior.away * 100)}%`,
      `כושר אחרון: ${homeMatches.length} משחקים של ${source.fixture.homeTeam} ו-${awayMatches.length} של ${source.fixture.awayTeam}`,
      "יתרון הבית ומשקל יורד למשחקים ישנים נכללים בחישוב",
    ],
  };
}
