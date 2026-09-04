import type { WireMatchesResponse } from "@/lib/football-data/types";

export type RecentMatch = {
  providerMatchId: number;
  kickoffAt: string;
  competition: string;
  homeTeamId: number;
  homeTeam: string;
  homeTeamCrest: string | null;
  awayTeamId: number;
  awayTeam: string;
  awayTeamCrest: string | null;
  homeGoals: number;
  awayGoals: number;
};

export type FixtureRecentForm = {
  fixtureId: string;
  homeTeamProviderId: number;
  awayTeamProviderId: number;
  homeMatches: RecentMatch[];
  awayMatches: RecentMatch[];
  fetchedAt: string;
};

/** Maps only completed provider matches that were known before kickoff. */
export function recentMatchesFromResponse(
  response: WireMatchesResponse,
  before: string,
  limit = 5
): RecentMatch[] {
  return response.matches
    .filter(
      (match) =>
        match.status === "FINISHED" &&
        match.utcDate < before &&
        match.score.fullTime.home !== null &&
        match.score.fullTime.away !== null
    )
    .sort((left, right) => right.utcDate.localeCompare(left.utcDate))
    .slice(0, limit)
    .map((match) => ({
      providerMatchId: match.id,
      kickoffAt: match.utcDate,
      competition: match.competition?.name ?? "Football match",
      homeTeamId: match.homeTeam.id,
      homeTeam: match.homeTeam.shortName ?? match.homeTeam.name,
      homeTeamCrest: match.homeTeam.crest,
      awayTeamId: match.awayTeam.id,
      awayTeam: match.awayTeam.shortName ?? match.awayTeam.name,
      awayTeamCrest: match.awayTeam.crest,
      homeGoals: match.score.fullTime.home!,
      awayGoals: match.score.fullTime.away!,
    }));
}

export function recentMatchOutcome(
  match: RecentMatch,
  teamProviderId: number
): "win" | "draw" | "loss" {
  if (match.homeGoals === match.awayGoals) return "draw";
  const homeWon = match.homeGoals > match.awayGoals;
  return homeWon === (match.homeTeamId === teamProviderId) ? "win" : "loss";
}