import "server-only";

import type { Team } from "@/lib/fixtures/types";
import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type TopScorerRow = {
  rank: number;
  playerId: number;
  name: string;
  teamName: string;
  goals: number;
  assists: number;
  photoUrl: string | null;
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

  const [playersResult, teamsResult, playerTranslationsResult, teamTranslationsResult] = await Promise.all([
    db
      .from("competition_scorers")
      .select(
        "football_data_id, name, team_id, goals, assists, photo_url"
      )
      .eq("season", season)
      .order("goals", { ascending: false })
      .order("assists", { ascending: false })
      .order("name", { ascending: true }),
    db.from("teams").select("*"),
    db
      .from("season_player_candidates")
      .select("football_data_id, name_en, name_he, photo_url")
      .eq("season", season),
    db
      .from("season_team_candidates")
      .select("team_id, name_en, name_he")
      .eq("season", season),
  ]);

  if (playersResult.error) {
    if (isMissingTable(playersResult.error)) {
      throw new SchemaNotReadyError("competition_scorers");
    }
    throw new Error(`Loading top scorers failed: ${playersResult.error.message}`);
  }
  if (teamsResult.error) {
    if (isMissingTable(teamsResult.error)) throw new SchemaNotReadyError("teams");
    throw new Error(`Loading scorer teams failed: ${teamsResult.error.message}`);
  }
  if (playerTranslationsResult.error) {
    if (isMissingTable(playerTranslationsResult.error)) {
      throw new SchemaNotReadyError("season_player_candidates");
    }
    throw new Error(`Loading scorer translations failed: ${playerTranslationsResult.error.message}`);
  }
  if (teamTranslationsResult.error) {
    if (isMissingTable(teamTranslationsResult.error)) {
      throw new SchemaNotReadyError("season_team_candidates");
    }
    throw new Error(`Loading scorer team translations failed: ${teamTranslationsResult.error.message}`);
  }

  const teams = new Map((teamsResult.data ?? []).map((team) => [team.id, team]));
  const playerTranslations = new Map(
    (playerTranslationsResult.data ?? []).flatMap((player) =>
      player.football_data_id === null
        ? []
        : [[player.football_data_id, player] as const]
    )
  );
  const teamTranslations = new Map(
    (teamTranslationsResult.data ?? []).flatMap((team) =>
      team.team_id === null ? [] : [[team.team_id, team] as const]
    )
  );
  let displayedRank = 0;
  let previousGoals: number | null = null;

  return (playersResult.data ?? []).map((player, index) => {
    if (player.goals !== previousGoals) displayedRank = index + 1;
    previousGoals = player.goals;

    const playerTranslation = playerTranslations.get(player.football_data_id);
    const teamTranslation = teamTranslations.get(player.team_id);
    const storedTeam = teams.get(player.team_id);
    const localizedTeamName = teamTranslation
      ? locale === "he"
        ? teamTranslation.name_he
        : teamTranslation.name_en
      : storedTeam?.short_name ?? storedTeam?.name ?? "";
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
      playerId: player.football_data_id,
      name: playerTranslation
        ? locale === "he"
          ? playerTranslation.name_he
          : playerTranslation.name_en
        : player.name,
      teamName: localizedTeamName,
      goals: player.goals,
      assists: player.assists,
      photoUrl: player.photo_url ?? playerTranslation?.photo_url ?? null,
      team,
    };
  });
}
