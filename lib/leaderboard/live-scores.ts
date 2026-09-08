import { scorePrediction } from "../scoring/engine.ts";

type LiveFixture = {
  id: string; status: string; home_goals: number | null; away_goals: number | null;
  home_win_points: number; draw_points: number; away_win_points: number;
};
export function liveScoreRows(
  fixtures: LiveFixture[],
  predictions: { user_id: string; fixture_id: string; home_goals: number; away_goals: number }[]
) {
  const live = new Map(fixtures.filter(f => f.status === "live" || f.status === "halftime").map(f => [f.id, f]));
  return predictions.flatMap(p => {
    const f = live.get(p.fixture_id);
    if (!f || f.home_goals === null || f.away_goals === null) return [];
    const score = scorePrediction(
      { homeGoals: p.home_goals, awayGoals: p.away_goals },
      { homeGoals: f.home_goals, awayGoals: f.away_goals },
      { home: f.home_win_points, draw: f.draw_points, away: f.away_win_points }
    );
    return [{ userId: p.user_id, fixtureId: p.fixture_id, totalPoints: score.totalPoints,
      exactScore: score.exactScore, correctOutcome: score.correctOutcome, provisional: true }];
  });
}
