import "server-only";

import { normalizePersonName } from "@/lib/fixtures/localization";
import type { Fixture } from "@/lib/fixtures/types";
import { publicEnv } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type SquadPlayer = {
  id: string;
  footballDataId: number | null;
  name: string;
  position: string | null;
  shirtNumber: number | null;
  nationality: string | null;
  dateOfBirth: string | null;
  photoUrl: string | null;
};

export type TeamSquad = {
  teamId: string;
  players: SquadPlayer[];
};

function isMissingTable(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /Could not find the table/i.test(error.message)
  );
}

function ownedPlayerPhoto(url: string | null): string | null {
  if (!url) return null;
  const prefix = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/player-images/`;
  return url.startsWith(prefix) ? url : null;
}

/** Loads both seasonal squads in one server-side query. */
export async function getFixtureTeamSquads(
  fixture: Fixture
): Promise<TeamSquad[]> {
  if (fixture.season === undefined) return [];

  const db = createServiceRoleClient();
  const teamIds = [fixture.homeTeam.id, fixture.awayTeam.id];
  const [squadsResult, translationsResult] = await Promise.all([
    db
      .from("team_squad_players")
      .select(
        "team_id, source, source_player_id, football_data_id, name, position, shirt_number, nationality, date_of_birth, photo_url"
      )
      .eq("season", fixture.season)
      .in("team_id", teamIds),
    db
      .from("season_player_candidates")
      .select("football_data_id, name_en, photo_url")
      .eq("season", fixture.season),
  ]);

  if (squadsResult.error) {
    if (isMissingTable(squadsResult.error)) return [];
    throw new Error(`Loading team squads failed: ${squadsResult.error.message}`);
  }
  if (translationsResult.error) {
    throw new Error(
      `Loading squad translations failed: ${translationsResult.error.message}`
    );
  }

  const candidateById = new Map(
    (translationsResult.data ?? []).flatMap((player) =>
      player.football_data_id === null
        ? []
        : [[player.football_data_id, player] as const]
    )
  );
  const candidateByName = new Map(
    (translationsResult.data ?? []).map((player) => [
      normalizePersonName(player.name_en),
      player,
    ])
  );

  return teamIds.map((teamId) => ({
    teamId,
    players: (squadsResult.data ?? [])
      .filter((player) => player.team_id === teamId)
      .map((player) => {
        const candidate =
          (player.football_data_id === null
            ? undefined
            : candidateById.get(player.football_data_id)) ??
          candidateByName.get(normalizePersonName(player.name));
        return {
          id: `${player.source}:${player.source_player_id}`,
          footballDataId: player.football_data_id,
          // Squad lists deliberately keep the provider's original English name,
          // independently of the page locale.
          name: player.name,
          position: player.position,
          shirtNumber: player.shirt_number,
          nationality: player.nationality,
          dateOfBirth: player.date_of_birth,
          photoUrl:
            ownedPlayerPhoto(candidate?.photo_url ?? null) ??
            ownedPlayerPhoto(player.photo_url),
        };
      }),
  }));
}
