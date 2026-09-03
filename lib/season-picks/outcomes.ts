import type { WireMatch, WireScorer } from "../football-data/types.ts";

const FINISHED_STATUSES = new Set(["FINISHED", "AWARDED"]);

/** Returns the winning club only once the competition final is complete. */
export function championApiId(fixtures: WireMatch[]): number | null {
  const final = fixtures.find(
    (fixture) =>
      fixture.stage === "FINAL" && FINISHED_STATUSES.has(fixture.status)
  );

  if (!final) return null;
  if (final.score.winner === "HOME_TEAM") return final.homeTeam.id;
  if (final.score.winner === "AWAY_TEAM") return final.awayTeam.id;
  return null;
}

/** All players tied for the most goals, so a shared Golden Boot pays everyone. */
export function topScorerApiIds(
  entries: WireScorer[]
): number[] {
  const totals = entries.map((entry) => ({
    footballDataId: entry.player.id,
    goals: entry.goals,
  }));

  const maximum = Math.max(-1, ...totals.map((row) => row.goals));
  return totals
    .filter((row) => row.goals === maximum)
    .map((row) => row.footballDataId);
}

export function seasonPickAward(
  pick: {
    championTeamId: string | null;
    topScorerFootballDataId: number | null;
    championPickPoints: number;
    scorerPickPoints: number;
  },
  outcome: { championTeamId: string; topScorerFootballDataIds: number[] }
): { championPoints: number; scorerPoints: number } {
  return {
    championPoints:
      pick.championTeamId !== null &&
      pick.championTeamId === outcome.championTeamId
        ? pick.championPickPoints
        : 0,
    scorerPoints:
      pick.topScorerFootballDataId !== null &&
      outcome.topScorerFootballDataIds.includes(pick.topScorerFootballDataId)
      ? pick.scorerPickPoints
      : 0,
  };
}
