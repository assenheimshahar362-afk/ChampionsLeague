"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin/auth";
import { settleDueFixtures } from "@/lib/settle/run";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

async function adminUser() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error("Admin access required");
  return user;
}

export async function adminDeleteUser(formData: FormData): Promise<void> {
  const admin = await adminUser();
  const userId = z.uuid().parse(formData.get("userId"));
  if (userId === admin.id) return;
  const service = createServiceRoleClient();
  const { error: storageError } = await service.storage
    .from("avatars")
    .remove([`${userId}/avatar`]);
  if (storageError) {
    console.error("Cleaning participant avatar failed", storageError.message);
  }
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Deleting participant failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminResetAvatar(formData: FormData): Promise<void> {
  await adminUser();
  const userId = z.uuid().parse(formData.get("userId"));
  const service = createServiceRoleClient();
  const { error: storageError } = await service.storage
    .from("avatars")
    .remove([`${userId}/avatar`]);
  if (storageError) {
    console.error("Resetting participant avatar file failed", storageError.message);
  }
  const { error } = await service
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId);
  if (error) throw new Error(`Resetting participant avatar failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminUpdateNickname(formData: FormData): Promise<void> {
  await adminUser();
  const userId = z.uuid().parse(formData.get("userId"));
  const nickname = z.string().trim().min(2).max(30)
    .regex(/^[\p{L}\p{N} _.\-]+$/u).refine((value) => /\p{L}/u.test(value))
    .parse(formData.get("nickname"));
  const { error } = await createServiceRoleClient().from("profiles")
    .update({ display_name: nickname, nickname_confirmed_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw new Error(`Updating nickname failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminDeleteGroup(formData: FormData): Promise<void> {
  await adminUser();
  const groupId = z.uuid().parse(formData.get("groupId"));
  const { error } = await createServiceRoleClient().from("groups").delete().eq("id", groupId);
  if (error) throw new Error(`Deleting group failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminCreateGroup(formData: FormData): Promise<void> {
  const admin = await adminUser();
  const name = z.string().trim().min(2).max(60).parse(formData.get("name"));
  const { error } = await createServiceRoleClient()
    .from("groups")
    .insert({ name, created_by: admin.id });
  if (error) throw new Error(`Creating group failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminRenameGroup(formData: FormData): Promise<void> {
  await adminUser();
  const groupId = z.uuid().parse(formData.get("groupId"));
  const name = z.string().trim().min(2).max(60).parse(formData.get("name"));
  const { error } = await createServiceRoleClient().from("groups").update({ name }).eq("id", groupId);
  if (error) throw new Error(`Renaming group failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminAddGroupMember(formData: FormData): Promise<void> {
  await adminUser();
  const groupId = z.uuid().parse(formData.get("groupId"));
  const userId = z.uuid().parse(formData.get("userId"));
  const role = z.enum(["member", "manager"]).parse(formData.get("role"));
  const { error } = await createServiceRoleClient()
    .from("group_members")
    .insert({ group_id: groupId, user_id: userId, role });
  if (error) throw new Error(`Adding group member failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminChangeGroupMemberRole(
  formData: FormData
): Promise<void> {
  await adminUser();
  const groupId = z.uuid().parse(formData.get("groupId"));
  const userId = z.uuid().parse(formData.get("userId"));
  const role = z.enum(["member", "manager"]).parse(formData.get("role"));
  const service = createServiceRoleClient();

  if (role === "member") {
    const { count } = await service
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("role", "manager");
    const { data: target } = await service
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (target?.role === "manager" && (count ?? 0) <= 1) return;
  }

  const { error } = await service
    .from("group_members")
    .update({ role })
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw new Error(`Changing group role failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminRemoveGroupMember(formData: FormData): Promise<void> {
  await adminUser();
  const groupId = z.uuid().parse(formData.get("groupId"));
  const userId = z.uuid().parse(formData.get("userId"));
  const service = createServiceRoleClient();
  const [{ data: target }, { count }] = await Promise.all([
    service
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("role", "manager"),
  ]);
  if (target?.role === "manager" && (count ?? 0) <= 1) return;

  const { error } = await service
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw new Error(`Removing group member failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminUpdateFixtureKickoff(
  formData: FormData
): Promise<void> {
  await adminUser();
  const fixtureId = z.uuid().parse(formData.get("fixtureId"));
  const kickoffAt = z.iso
    .datetime({ offset: true })
    .parse(formData.get("kickoffAt"));
  const { error } = await createServiceRoleClient()
    .from("fixtures")
    .update({ kickoff_at: kickoffAt })
    .eq("id", fixtureId);
  if (error) throw new Error(`Updating fixture kickoff failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminUpdateGameSettings(formData: FormData): Promise<void> {
  const admin = await adminUser();
  const parsed = z
    .object({
      exactPoints: z.coerce.number().int().min(1).max(100),
      outcomePoints: z.coerce.number().int().min(1).max(100),
      rulesNoteEn: z.string().trim().max(2000),
      rulesNoteHe: z.string().trim().max(2000),
    })
    .refine((value) => value.exactPoints > value.outcomePoints)
    .parse({
      exactPoints: formData.get("exactPoints"),
      outcomePoints: formData.get("outcomePoints"),
      rulesNoteEn: formData.get("rulesNoteEn"),
      rulesNoteHe: formData.get("rulesNoteHe"),
    });

  const { error } = await createServiceRoleClient().rpc(
    "admin_set_game_settings",
    {
      new_exact_points: parsed.exactPoints,
      new_outcome_points: parsed.outcomePoints,
      new_rules_note_en: parsed.rulesNoteEn,
      new_rules_note_he: parsed.rulesNoteHe,
      admin_user_id: admin.id,
    }
  );
  if (error) throw new Error(`Updating game settings failed: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function adminRunSettlement(): Promise<void> {
  await adminUser();
  await settleDueFixtures();
  revalidatePath("/", "layout");
}

export async function adminUpdateCandidatePoints(formData: FormData): Promise<void> {
  await adminUser();
  const kind = z.enum(["team", "player"]).parse(formData.get("kind"));
  const season = z.coerce.number().int().min(2011).max(2100).parse(formData.get("season"));
  const points = z.coerce.number().int().min(1).max(kind === "team" ? 2000 : 500).parse(formData.get("points"));
  const db = createServiceRoleClient();

  if (kind === "team") {
    const candidateId = z.coerce.number().int().positive().parse(formData.get("candidateId"));
    const { error } = await db.rpc("admin_set_team_candidate_points", {
      target_season: season,
      target_candidate_id: candidateId,
      new_points: points,
    });
    if (error) throw new Error(`Updating team points failed: ${error.message}`);
  } else {
    const candidateId = z.coerce.number().int().positive().parse(formData.get("candidateId"));
    const { error } = await db.rpc("admin_set_player_candidate_points", {
      target_season: season,
      target_candidate_id: candidateId,
      new_points: points,
    });
    if (error) throw new Error(`Updating player points failed: ${error.message}`);
  }

  revalidatePath("/", "layout");
}
