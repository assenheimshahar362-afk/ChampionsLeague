import "server-only";

import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import { createClient } from "@/lib/supabase/server";

function isMissingTable(error: { code?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

function isMissingProfileShape(error: { code?: string }): boolean {
  return (
    isMissingTable(error) ||
    error.code === "42703" ||
    error.code === "PGRST204"
  );
}

export type NavigationProfile = {
  displayName: string;
  avatarUrl: string | null;
};

export type PersonalProfile = {
  displayName: string;
  avatarUrl: string | null;
  nicknameConfirmedAt: string | null;
  createdAt: string;
};

export type SeasonPickOverview = {
  season: number;
  locked: boolean;
  champion: {
    candidateId: number;
    nameEn: string;
    nameHe: string;
    logoUrl: string | null;
  };
  topScorer: {
    candidateId: number;
    nameEn: string;
    nameHe: string;
    photoUrl: string | null;
    teamNameEn: string;
    teamNameHe: string;
  };
  championPotentialPoints: number;
  scorerPotentialPoints: number;
  championAwardedPoints: number;
  scorerAwardedPoints: number;
  settledAt: string | null;
};

/** Compact identity used by the global header. */
export async function getNavigationProfile(
  userId: string
): Promise<NavigationProfile | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  // The header must remain usable while the setup notice is guiding a fresh
  // deployment through its migrations. Unexpected database errors still fail
  // loudly rather than silently hiding the profile control.
  if (error) {
    if (isMissingProfileShape(error)) return null;
    throw new Error(`Loading navigation profile failed: ${error.message}`);
  }

  return data
    ? { displayName: data.display_name, avatarUrl: data.avatar_url }
    : null;
}

export async function getPersonalProfile(
  userId: string
): Promise<PersonalProfile | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .select("display_name, avatar_url, nickname_confirmed_at, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) throw new SchemaNotReadyError("profiles");
    throw new Error(`Loading personal profile failed: ${error.message}`);
  }

  return data
    ? {
        displayName: data.display_name,
        avatarUrl: data.avatar_url,
        nicknameConfirmedAt: data.nickname_confirmed_at,
        createdAt: data.created_at,
      }
    : null;
}

export async function getSeasonPickOverview(
  userId: string,
  now: number
): Promise<SeasonPickOverview | null> {
  const db = await createClient();
  const { data: pick, error: pickError } = await db
    .from("season_picks")
    .select(
      "season, champion_candidate_id, top_scorer_candidate_id, champion_pick_points, scorer_pick_points, champion_awarded_points, scorer_awarded_points, settled_at"
    )
    .eq("user_id", userId)
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pickError) {
    if (isMissingTable(pickError)) throw new SchemaNotReadyError("season_picks");
    throw new Error(`Loading season picks failed: ${pickError.message}`);
  }
  if (!pick) return null;

  const { data: player, error: playerError } = await db
    .from("season_player_candidates")
    .select("candidate_id, name_en, name_he, photo_url, team_name_en, team_name_he")
    .eq("season", pick.season)
    .eq("candidate_id", pick.top_scorer_candidate_id)
    .maybeSingle();

  if (playerError) {
    if (isMissingTable(playerError)) {
      throw new SchemaNotReadyError("season_player_candidates");
    }
    throw new Error(`Loading top-scorer pick failed: ${playerError.message}`);
  }
  if (!player) throw new Error("The saved top-scorer candidate no longer exists.");

  const { data: champion, error: championError } = await db
    .from("season_team_candidates")
    .select("candidate_id, name_en, name_he, logo_url")
    .eq("season", pick.season)
    .eq("candidate_id", pick.champion_candidate_id)
    .maybeSingle();
  if (championError) {
    throw new Error(`Loading champion pick failed: ${championError.message}`);
  }
  if (!champion) {
    throw new Error("The saved champion candidate no longer exists.");
  }

  const { data: firstFixture, error: firstFixtureError } = await db
    .from("fixtures")
    .select("kickoff_at")
    .eq("season", pick.season)
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstFixtureError) {
    throw new Error(`Loading first season fixture failed: ${firstFixtureError.message}`);
  }

  return {
    season: pick.season,
    locked: Boolean(
      firstFixture && new Date(firstFixture.kickoff_at).getTime() <= now
    ),
    champion: {
      candidateId: champion.candidate_id,
      nameEn: champion.name_en,
      nameHe: champion.name_he,
      logoUrl: champion.logo_url,
    },
    topScorer: {
      candidateId: player.candidate_id,
      nameEn: player.name_en,
      nameHe: player.name_he,
      photoUrl: player.photo_url,
      teamNameEn: player.team_name_en,
      teamNameHe: player.team_name_he,
    },
    championPotentialPoints: pick.champion_pick_points,
    scorerPotentialPoints: pick.scorer_pick_points,
    championAwardedPoints: pick.champion_awarded_points,
    scorerAwardedPoints: pick.scorer_awarded_points,
    settledAt: pick.settled_at,
  };
}
