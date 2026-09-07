"use server";

import { z } from "zod";

import { AI_PLAYER_ID } from "@/lib/leaderboard/ai-player";
import {
  getLeaderboard,
  type LeaderboardPlayerHistory,
} from "@/lib/leaderboard/queries";
import { getUser } from "@/lib/supabase/server";

export type LeaderboardHistoryLoadResult =
  | { ok: true; player: LeaderboardPlayerHistory }
  | { ok: false };

const playerIdSchema = z.union([z.uuid(), z.literal(AI_PLAYER_ID)]);
const groupIdSchema = z.uuid().nullable();

export async function loadLeaderboardPlayerHistory(
  playerIdInput: string,
  groupIdInput: string | null
): Promise<LeaderboardHistoryLoadResult> {
  const user = await getUser();
  if (!user) return { ok: false };

  const playerId = playerIdSchema.safeParse(playerIdInput);
  const groupId = groupIdSchema.safeParse(groupIdInput);
  if (!playerId.success || !groupId.success) return { ok: false };

  const leaderboard = await getLeaderboard(
    user.id,
    groupId.data ?? undefined,
    playerId.data
  );
  return leaderboard.selectedPlayer
    ? { ok: true, player: leaderboard.selectedPlayer }
    : { ok: false };
}
