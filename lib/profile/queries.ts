import "server-only";

import {
  SchemaNotReadyError,
  getMyPredictions,
  getMyScores,
} from "@/lib/fixtures/queries";
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

export type PersonalProfileOverview = {
  profile: PersonalProfile | null;
  predictionCount: number;
  matchPoints: number;
  groupCount: number;
  seasonPick: SeasonPickOverview | null;
};

function isMissingProfileOverviewRpc(error: { code?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}

/** One round trip for every value needed above the profile's groups section. */
export async function getPersonalProfileOverview(
  userId: string,
  now: number
): Promise<PersonalProfileOverview> {
  const db = await createClient();
  const { data, error } = await db
    .rpc("get_my_profile_overview", {
      request_now: new Date(now).toISOString(),
    })
    .maybeSingle();

  // Keep local development usable until migration 0008 has been applied.
  if (error && isMissingProfileOverviewRpc(error)) {
    const [profile, predictions, scores, seasonPick, memberships] =
      await Promise.all([
        getPersonalProfile(userId),
        getMyPredictions(userId),
        getMyScores(userId),
        getSeasonPickOverview(userId, now),
        db
          .from("group_members")
          .select("group_id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
    if (memberships.error) {
      throw new Error(
        `Loading profile group count failed: ${memberships.error.message}`
      );
    }
    return {
      profile,
      predictionCount: Object.keys(predictions).length,
      matchPoints: Object.values(scores).reduce(
        (sum, score) => sum + score.totalPoints,
        0
      ),
      groupCount: memberships.count ?? 0,
      seasonPick,
    };
  }

  if (error) {
    if (isMissingTable(error)) throw new SchemaNotReadyError("profiles");
    throw new Error(`Loading profile overview failed: ${error.message}`);
  }
  if (!data) {
    return {
      profile: null,
      predictionCount: 0,
      matchPoints: 0,
      groupCount: 0,
      seasonPick: null,
    };
  }

  let seasonPick: SeasonPickOverview | null = null;
  if (data.pick_season !== null) {
    if (
      data.champion_candidate_id === null ||
      data.champion_name_en === null ||
      data.champion_name_he === null ||
      data.scorer_candidate_id === null ||
      data.scorer_name_en === null ||
      data.scorer_name_he === null ||
      data.scorer_team_name_en === null ||
      data.scorer_team_name_he === null
    ) {
      throw new Error("The saved season-pick candidate no longer exists.");
    }
    seasonPick = {
      season: data.pick_season,
      locked: data.pick_locked,
      champion: {
        candidateId: data.champion_candidate_id,
        nameEn: data.champion_name_en,
        nameHe: data.champion_name_he,
        logoUrl: data.champion_logo_url,
      },
      topScorer: {
        candidateId: data.scorer_candidate_id,
        nameEn: data.scorer_name_en,
        nameHe: data.scorer_name_he,
        photoUrl: data.scorer_photo_url,
        teamNameEn: data.scorer_team_name_en,
        teamNameHe: data.scorer_team_name_he,
      },
      championPotentialPoints: data.champion_pick_points ?? 0,
      scorerPotentialPoints: data.scorer_pick_points ?? 0,
      championAwardedPoints: data.champion_awarded_points ?? 0,
      scorerAwardedPoints: data.scorer_awarded_points ?? 0,
      settledAt: data.pick_settled_at,
    };
  }

  return {
    profile: {
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      nicknameConfirmedAt: data.nickname_confirmed_at,
      createdAt: data.profile_created_at,
    },
    predictionCount: data.prediction_count,
    matchPoints: data.match_points,
    groupCount: data.group_count,
    seasonPick,
  };
}

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
