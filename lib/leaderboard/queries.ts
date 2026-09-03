import "server-only";

import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import {
  buildLeaderboard,
  memberIdsForGroup,
  type GroupMembership,
  type LeaderboardRow,
} from "@/lib/leaderboard/ranking";
import { createClient } from "@/lib/supabase/server";

export type { LeaderboardRow } from "@/lib/leaderboard/ranking";

export type LeaderboardGroup = {
  id: string;
  name: string;
  entryFeeAgorot: number;
  memberCount: number;
  potAgorot: number;
};

export type LeaderboardView = {
  groups: LeaderboardGroup[];
  selectedGroup: LeaderboardGroup | null;
  rows: LeaderboardRow[];
  currentSeason: number | null;
  picksRevealed: boolean;
};

type PostgrestFailure = { code?: string; message: string };

function isMissingTable(error: PostgrestFailure): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    /Could not find the (table|function)/i.test(error.message)
  );
}

function assertResult(
  table: string,
  result: { error: PostgrestFailure | null }
): void {
  if (!result.error) return;
  if (isMissingTable(result.error)) throw new SchemaNotReadyError(table);
  throw new Error(`Loading ${table} failed: ${result.error.message}`);
}

/**
 * Loads the system-wide champions table by default, including players who do
 * not belong to any friends group. A selected friends group narrows the same
 * user-owned predictions and season picks to that group's roster.
 */
export async function getLeaderboard(
  userId: string,
  requestedGroupId?: string
): Promise<LeaderboardView> {
  const supabase = await createClient();

  const [mine, pickStateResult] = await Promise.all([
    supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId),
    supabase.rpc("current_season_pick_state"),
  ]);
  assertResult("group_members", mine);
  assertResult("current_season_pick_state", pickStateResult);

  const pickState = pickStateResult.data?.[0] ?? null;
  const currentSeason = pickState?.season ?? null;
  const picksRevealed = pickState?.revealed ?? false;

  const myGroupIds = [...new Set((mine.data ?? []).map((row) => row.group_id))];
  let groups: LeaderboardGroup[] = [];
  let memberships: GroupMembership[] = [];
  if (myGroupIds.length > 0) {
    const [groupsResult, membershipsResult] = await Promise.all([
      supabase
        .from("groups")
        .select("id, name, entry_fee_agorot")
        .in("id", myGroupIds)
        .order("name"),
      supabase
        .from("group_members")
        .select("group_id, user_id")
        .in("group_id", myGroupIds),
    ]);
    assertResult("groups", groupsResult);
    assertResult("group_members", membershipsResult);

    memberships = (membershipsResult.data ?? []).map((membership) => ({
      groupId: membership.group_id,
      userId: membership.user_id,
    }));
    const memberCountByGroup = new Map<string, number>();
    for (const membership of memberships) {
      memberCountByGroup.set(
        membership.groupId,
        (memberCountByGroup.get(membership.groupId) ?? 0) + 1
      );
    }
    groups = (groupsResult.data ?? []).map((group) => {
      const memberCount = memberCountByGroup.get(group.id) ?? 0;
      return {
        id: group.id,
        name: group.name,
        entryFeeAgorot: group.entry_fee_agorot,
        memberCount,
        potAgorot: memberCount * group.entry_fee_agorot,
      };
    });
  }

  // An arbitrary query-string UUID never widens access. If it is not one of
  // the caller's groups, fall back to the system-wide table.
  const selectedGroup =
    groups.find((group) => group.id === requestedGroupId) ?? null;

  let memberIds: string[] | null = null;
  if (selectedGroup) {
    memberIds = memberIdsForGroup(memberships, selectedGroup.id);

    if (memberIds.length === 0) {
      return {
        groups,
        selectedGroup,
        rows: [],
        currentSeason,
        picksRevealed,
      };
    }
  }

  const scoresQuery = supabase
    .from("prediction_scores")
    .select("user_id, total_points, exact_score, correct_outcome");
  const profilesQuery = supabase
    .from("profiles")
    .select("id, display_name, avatar_url");
  const seasonPicksQuery = supabase.rpc(
    "get_visible_leaderboard_season_picks"
  );

  const [scores, profiles, seasonPicks] = await Promise.all([
    memberIds ? scoresQuery.in("user_id", memberIds) : scoresQuery,
    memberIds ? profilesQuery.in("id", memberIds) : profilesQuery,
    memberIds ? seasonPicksQuery.in("user_id", memberIds) : seasonPicksQuery,
  ]);

  for (const [table, result] of [
    ["prediction_scores", scores],
    ["profiles", profiles],
    ["season_picks", seasonPicks],
  ] as const) {
    assertResult(table, result);
  }

  const rows = buildLeaderboard({
    eligibleUserIds:
      memberIds ?? (profiles.data ?? []).map((profile) => profile.id),
    profiles: (profiles.data ?? []).map((profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
    })),
    scores: (scores.data ?? []).map((score) => ({
      userId: score.user_id,
      totalPoints: score.total_points,
      exactScore: score.exact_score,
      correctOutcome: score.correct_outcome,
    })),
    seasonPicks: (seasonPicks.data ?? []).map((pick) => ({
      userId: pick.user_id,
      season: pick.season,
      championAwardedPoints: pick.champion_awarded_points,
      scorerAwardedPoints: pick.scorer_awarded_points,
      settledAt: pick.settled_at,
      championNameEn: pick.champion_name_en,
      championNameHe: pick.champion_name_he,
      championLogoUrl: pick.champion_logo_url,
      scorerNameEn: pick.scorer_name_en,
      scorerNameHe: pick.scorer_name_he,
      scorerPhotoUrl: pick.scorer_photo_url,
    })),
    viewerUserId: userId,
    currentSeason,
    picksRevealed,
  });

  return { groups, selectedGroup, rows, currentSeason, picksRevealed };
}
