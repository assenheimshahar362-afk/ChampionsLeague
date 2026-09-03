import "server-only";

import type { Team } from "@/lib/fixtures/types";
import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type TopScorerRow = {
  rank: number;
  candidateId: number;
  name: string;
  teamName: string;
  goals: number;
  assists: number;
  team: Team | null;
};

function isMissingTable(error: { code?: string; message: string }): boolean {
  return (
    error.code === "PGRST205" ||
    /Could not find the table/i.test(error.message)
  );
}

/** Current Golden Boot race for the same season shown in the club table. */
export async function getTopScorers(
  locale: string
): Promise<TopScorerRow[]> {
  const db = createServiceRoleClient();
  const latest = await db
    .from("fixtures")
    .select("season")
    .order("season", { ascending: false })
    .limit(1);

  if (latest.error) {
    if (isMissingTable(latest.error)) throw new SchemaNotReadyError("fixtures");
    throw new Error(`Finding the scorer season failed: ${latest.error.message}`);
  }
  const season = latest.data?.[0]?.season;
  if (season === undefined) return [];

  const [playersResult, teamsResult] = await Promise.all([
    db
      .from("season_player_candidates")
      .select(
        "candidate_id, name_en, name_he, team_id, team_name_en, team_name_he, source_goals, source_assists"
      )
      .eq("season", season)
      .gt("source_goals", 0)
      .order("source_goals", { ascending: false })
      .order("source_assists", { ascending: false })
      .order("name_en", { ascending: true })
      .limit(50),
    db.from("teams").select("*"),
  ]);

  if (playersResult.error) {
    if (isMissingTable(playersResult.error)) {
      throw new SchemaNotReadyError("season_player_candidates");
    }
    throw new Error(`Loading top scorers failed: ${playersResult.error.message}`);
  }
  if (teamsResult.error) {
    if (isMissingTable(teamsResult.error)) throw new SchemaNotReadyError("teams");
    throw new Error(`Loading scorer teams failed: ${teamsResult.error.message}`);
  }

  const teams = new Map((teamsResult.data ?? []).map((team) => [team.id, team]));
  let displayedRank = 0;
  let previousGoals: number | null = null;

  return (playersResult.data ?? []).map((player, index) => {
    if (player.source_goals !== previousGoals) displayedRank = index + 1;
    previousGoals = player.source_goals;

    const localizedTeamName =
      locale === "he" ? player.team_name_he : player.team_name_en;
    const storedTeam = player.team_id ? teams.get(player.team_id) : undefined;
    const team: Team | null = storedTeam
      ? {
          id: storedTeam.id,
          name: localizedTeamName,
          shortName: localizedTeamName,
          code: storedTeam.code,
          color: storedTeam.color,
          logoUrl: storedTeam.logo_url,
        }
      : null;

    return {
      rank: displayedRank,
      candidateId: player.candidate_id,
      name: locale === "he" ? player.name_he : player.name_en,
      teamName: localizedTeamName,
      goals: player.source_goals,
      assists: player.source_assists,
      team,
    };
  });
}
