import "server-only";

import { z } from "zod";

import { isAdminEmail } from "@/lib/admin/auth";
import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import {
  groupPaymentSettingsFromRow,
  type GroupPaymentSettings,
} from "@/lib/groups/payment";
import type { GroupMemberRoleEnum } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type GroupMemberView = {
  userId: string;
  nickname: string;
  role: GroupMemberRoleEnum;
  email: string | null;
};

export type GroupJoinRequestView = {
  id: string;
  userId: string;
  nickname: string;
  email: string | null;
  requestedAt: string;
};

export type GroupView = {
  id: string;
  name: string;
  imageUrl: string | null;
  entryFeeAgorot: number;
  inviteCode: string;
  myRole: GroupMemberRoleEnum;
  payment: GroupPaymentSettings;
  members: GroupMemberView[];
  pendingRequests: GroupJoinRequestView[];
};

export type GroupInviteView = {
  id: string;
  name: string;
  imageUrl: string | null;
  entryFeeAgorot: number;
  inviteCode: string;
  memberCount: number;
  membership: "member" | "pending" | "declined" | null;
};

function missing(error: { code?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42703"
  );
}

export async function getMyGroups(
  userId: string,
  userEmail: string | null | undefined
): Promise<GroupView[]> {
  const db = await createClient();
  const { data: mine, error: mineError } = await db
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", userId);

  if (mineError) {
    if (missing(mineError)) throw new SchemaNotReadyError("group_members");
    throw new Error(`Loading group memberships failed: ${mineError.message}`);
  }
  if (!mine?.length) return [];

  const groupIds = mine.map((row) => row.group_id);
  const [{ data: groups, error: groupsError }, { data: members, error: membersError }] =
    await Promise.all([
      db
        .from("groups")
        .select(
          "id, name, image_url, entry_fee_agorot, invite_code, bit_payment_url, paybox_payment_url, payment_note"
        )
        .in("id", groupIds)
        .order("name"),
      db.from("group_members").select("group_id, user_id, role").in("group_id", groupIds),
    ]);

  if (groupsError) {
    if (missing(groupsError)) throw new SchemaNotReadyError("groups");
    throw new Error(`Loading groups failed: ${groupsError.message}`);
  }
  if (membersError) throw new Error(`Loading group members failed: ${membersError.message}`);

  const managerGroupIds = mine
    .filter((row) => row.role === "manager" || isAdminEmail(userEmail))
    .map((row) => row.group_id);
  const service = createServiceRoleClient();
  const { data: requests, error: requestsError } = managerGroupIds.length
    ? await service
        .from("group_join_requests")
        .select("id, group_id, user_id, requested_at")
        .in("group_id", managerGroupIds)
        .eq("status", "pending_payment")
    : { data: [], error: null };
  if (requestsError) throw new Error(`Loading group join requests failed: ${requestsError.message}`);

  const memberIds = [
    ...new Set([
      ...(members ?? []).map((row) => row.user_id),
      ...(requests ?? []).map((row) => row.user_id),
    ]),
  ];
  const { data: profiles, error: profilesError } = await db
    .from("profiles")
    .select("id, display_name")
    .in("id", memberIds);
  if (profilesError) throw new Error(`Loading member profiles failed: ${profilesError.message}`);

  const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));
  const myRoleByGroup = new Map(mine.map((row) => [row.group_id, row.role]));
  const canSeeAnyEmail = isAdminEmail(userEmail) || mine.some((row) => row.role === "manager");
  const emailById = new Map<string, string | null>();

  if (canSeeAnyEmail) {
    await Promise.all(
      memberIds.map(async (id) => {
        const { data } = await service.auth.admin.getUserById(id);
        emailById.set(id, data.user?.email ?? null);
      })
    );
  }

  return (groups ?? []).map((group) => {
    const myRole = myRoleByGroup.get(group.id) ?? "member";
    const canSeeEmail = myRole === "manager" || isAdminEmail(userEmail);
    return {
      id: group.id,
      name: group.name,
      imageUrl: group.image_url,
      entryFeeAgorot: group.entry_fee_agorot,
      inviteCode: group.invite_code,
      myRole,
      payment: groupPaymentSettingsFromRow(group),
      members: (members ?? [])
        .filter((row) => row.group_id === group.id)
        .flatMap((row) => {
          const profile = profileById.get(row.user_id);
          return profile
            ? [{
                userId: row.user_id,
                nickname: profile.display_name,
                role: row.role,
                email: canSeeEmail ? emailById.get(row.user_id) ?? null : null,
              }]
            : [];
        })
        .sort((a, b) =>
          (a.role === b.role ? 0 : a.role === "manager" ? -1 : 1) ||
          a.nickname.localeCompare(b.nickname)
        ),
      pendingRequests: (requests ?? [])
        .filter((request) => request.group_id === group.id)
        .flatMap((request) => {
          const profile = profileById.get(request.user_id);
          return profile
            ? [
                {
                  id: request.id,
                  userId: request.user_id,
                  nickname: profile.display_name,
                  email: emailById.get(request.user_id) ?? null,
                  requestedAt: request.requested_at,
                },
              ]
            : [];
        })
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    };
  });
}

export async function getGroupInvite(
  inviteCode: string,
  userId?: string
): Promise<GroupInviteView | null> {
  const parsed = z.uuid().safeParse(inviteCode);
  if (!parsed.success) return null;
  const service = createServiceRoleClient();
  const { data: group, error } = await service
    .from("groups")
    .select("id, name, image_url, entry_fee_agorot, invite_code")
    .eq("invite_code", parsed.data)
    .maybeSingle();
  if (error || !group) return null;

  const memberQuery = userId
    ? service
        .from("group_members")
        .select("role")
        .eq("group_id", group.id)
        .eq("user_id", userId)
        .maybeSingle()
    : Promise.resolve({ data: null });
  const requestQuery = userId
    ? service
        .from("group_join_requests")
        .select("status")
        .eq("group_id", group.id)
        .eq("user_id", userId)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [{ data: member }, { data: request }, { count }] = await Promise.all([
    memberQuery,
    requestQuery,
    service
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", group.id),
  ]);

  return {
    id: group.id,
    name: group.name,
    imageUrl: group.image_url,
    entryFeeAgorot: group.entry_fee_agorot,
    inviteCode: group.invite_code,
    memberCount: count ?? 0,
    membership: member
      ? "member"
      : request?.status === "pending_payment"
        ? "pending"
        : request?.status === "declined"
          ? "declined"
          : null,
  };
}
