import "server-only";

import { createClient } from "@/lib/supabase/server";

export type PredictionGroup = { id: string; name: string };

export type GroupFixturePrediction = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  settledPoints: number | null;
};

export type FixtureGroupPredictions = {
  groups: PredictionGroup[];
  selectedGroup: PredictionGroup | null;
  rows: GroupFixturePrediction[];
};

export async function getFixtureGroupPredictions(
  userId: string,
  fixtureId: string,
  requestedGroupId?: string
): Promise<FixtureGroupPredictions> {
  const db = await createClient();
  const { data: mine, error: mineError } = await db
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);
  if (mineError) {
    throw new Error(`Loading fixture groups failed: ${mineError.message}`);
  }

  const groupIds = [...new Set((mine ?? []).map((row) => row.group_id))];
  if (groupIds.length === 0) {
    return { groups: [], selectedGroup: null, rows: [] };
  }

  const { data: groupRows, error: groupError } = await db
    .from("groups")
    .select("id, name")
    .in("id", groupIds)
    .order("name");
  if (groupError) {
    throw new Error(`Loading fixture group names failed: ${groupError.message}`);
  }

  const groups = groupRows ?? [];
  const selectedGroup =
    groups.find((group) => group.id === requestedGroupId) ?? groups[0] ?? null;
  if (!selectedGroup) return { groups, selectedGroup: null, rows: [] };

  const { data: memberships, error: memberError } = await db
    .from("group_members")
    .select("user_id")
    .eq("group_id", selectedGroup.id);
  if (memberError) {
    throw new Error(`Loading fixture group members failed: ${memberError.message}`);
  }

  const memberIds = (memberships ?? []).map((row) => row.user_id);
  if (memberIds.length === 0) return { groups, selectedGroup, rows: [] };

  const [profiles, predictions, scores] = await Promise.all([
    db
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", memberIds),
    db
      .from("predictions")
      .select("user_id, home_goals, away_goals")
      .eq("fixture_id", fixtureId)
      .in("user_id", memberIds),
    db
      .from("prediction_scores")
      .select("user_id, total_points")
      .eq("fixture_id", fixtureId)
      .in("user_id", memberIds),
  ]);

  if (profiles.error) {
    throw new Error(`Loading prediction profiles failed: ${profiles.error.message}`);
  }
  if (predictions.error) {
    throw new Error(`Loading group predictions failed: ${predictions.error.message}`);
  }
  if (scores.error) {
    throw new Error(`Loading group prediction scores failed: ${scores.error.message}`);
  }

  const predictionByUser = new Map(
    (predictions.data ?? []).map((row) => [row.user_id, row])
  );
  const scoreByUser = new Map(
    (scores.data ?? []).map((row) => [row.user_id, row.total_points])
  );
  const rows = (profiles.data ?? [])
    .map((profile) => {
      const prediction = predictionByUser.get(profile.id);
      return {
        userId: profile.id,
        nickname: profile.display_name,
        avatarUrl: profile.avatar_url,
        homeGoals: prediction?.home_goals ?? null,
        awayGoals: prediction?.away_goals ?? null,
        settledPoints: scoreByUser.get(profile.id) ?? null,
      };
    })
    .sort(
      (a, b) =>
        (a.userId === userId ? -1 : b.userId === userId ? 1 : 0) ||
        a.nickname.localeCompare(b.nickname)
    );

  return { groups, selectedGroup, rows };
}
