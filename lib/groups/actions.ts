"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin/auth";
import { parseEntryFeeAgorot } from "@/lib/groups/fees";
import { parseGroupPaymentForm } from "@/lib/groups/payment";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hasMatchingImageSignature } from "@/lib/uploads/image";

export type GroupActionState =
  | { status: "idle" }
  | { status: "success"; code?: "paymentSaved" }
  | {
      status: "error";
      code:
        | "invalid"
        | "invalidImage"
        | "imageTooLarge"
        | "invalidPayment"
        | "notFound"
        | "notAllowed"
        | "alreadyMember"
        | "generic";
    };

export type InviteJoinResult =
  | { status: "success" }
  | { status: "error" };

const uuid = z.uuid();
const groupName = z.string().trim().min(2).max(60);
const MAX_GROUP_IMAGE_BYTES = 2 * 1024 * 1024;
const GROUP_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function groupImage(formData: FormData): Promise<
  | { image: File | null }
  | { error: "invalidImage" | "imageTooLarge" }
> {
  const value = formData.get("image");
  if (!(value instanceof File) || value.size === 0) return { image: null };
  if (!GROUP_IMAGE_MIME_TYPES.has(value.type)) return { error: "invalidImage" };
  if (value.size > MAX_GROUP_IMAGE_BYTES) return { error: "imageTooLarge" };
  if (!(await hasMatchingImageSignature(value))) return { error: "invalidImage" };
  return { image: value };
}

async function uploadGroupImage(groupId: string, image: File): Promise<string | null> {
  const service = createServiceRoleClient();
  const objectPath = `${groupId}/cover`;
  const { error } = await service.storage.from("group-images").upload(objectPath, image, {
    cacheControl: "3600",
    contentType: image.type,
    upsert: true,
  });
  if (error) {
    console.error("Uploading group image failed", error.message);
    return null;
  }
  const { data } = service.storage.from("group-images").getPublicUrl(objectPath);
  return `${data.publicUrl}?v=${Date.now()}`;
}

async function context() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  return { db, user };
}

async function canManage(
  db: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string },
  groupId: string
): Promise<boolean> {
  if (isAdminEmail(user.email)) return true;
  const { data } = await db.from("group_members").select("role")
    .eq("group_id", groupId).eq("user_id", user.id).maybeSingle();
  return data?.role === "manager";
}

export async function createGroup(
  _previous: GroupActionState,
  formData: FormData
): Promise<GroupActionState> {
  const parsed = groupName.safeParse(formData.get("name"));
  const fee = parseEntryFeeAgorot(formData.get("entryFee"));
  const imageResult = await groupImage(formData);
  if (!parsed.success || fee === null) return { status: "error", code: "invalid" };
  if ("error" in imageResult) return { status: "error", code: imageResult.error };
  const { db, user } = await context();
  if (!user) return { status: "error", code: "notAllowed" };
  const groupId = crypto.randomUUID();
  const { error } = await db
    .from("groups")
    .insert({
      id: groupId,
      name: parsed.data,
      entry_fee_agorot: fee,
      created_by: user.id,
    });
  if (error) {
    console.error("Creating group failed", error.message);
    return { status: "error", code: "generic" };
  }

  if (imageResult.image) {
    const imageUrl = await uploadGroupImage(groupId, imageResult.image);
    if (!imageUrl) {
      await createServiceRoleClient().from("groups").delete().eq("id", groupId);
      return { status: "error", code: "generic" };
    }
    const { error: imageError } = await createServiceRoleClient()
      .from("groups")
      .update({ image_url: imageUrl })
      .eq("id", groupId);
    if (imageError) return { status: "error", code: "generic" };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function updateGroup(
  _previous: GroupActionState,
  formData: FormData
): Promise<GroupActionState> {
  const groupId = uuid.safeParse(formData.get("groupId"));
  const name = groupName.safeParse(formData.get("name"));
  const fee = parseEntryFeeAgorot(formData.get("entryFee"));
  const imageResult = await groupImage(formData);
  if (!groupId.success || !name.success || fee === null) {
    return { status: "error", code: "invalid" };
  }
  if ("error" in imageResult) return { status: "error", code: imageResult.error };

  const { db, user } = await context();
  if (!user || !(await canManage(db, user, groupId.data))) {
    return { status: "error", code: "notAllowed" };
  }

  const service = createServiceRoleClient();
  let imageUrl: string | null | undefined;
  if (imageResult.image) {
    imageUrl = await uploadGroupImage(groupId.data, imageResult.image);
    if (!imageUrl) return { status: "error", code: "generic" };
  } else if (formData.get("removeImage") === "on") {
    const { error } = await service.storage
      .from("group-images")
      .remove([`${groupId.data}/cover`]);
    if (error) console.error("Removing group image failed", error.message);
    imageUrl = null;
  }

  const update = {
    name: name.data,
    entry_fee_agorot: fee,
    ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
    ...(fee === 0
      ? { bit_payment_url: null, paybox_payment_url: null, payment_note: null }
      : {}),
  };
  const { error } = await service.from("groups").update(update).eq("id", groupId.data);
  if (error) {
    console.error("Updating group failed", error.message);
    return { status: "error", code: "generic" };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}

/**
 * An invitation URL is a bearer invitation: once an authenticated user opens
 * it, membership is granted without another confirmation click.
 */
export async function joinGroupFromInvite(
  inviteCodeValue: string
): Promise<InviteJoinResult> {
  const inviteCode = uuid.safeParse(inviteCodeValue);
  if (!inviteCode.success) return { status: "error" };

  const { user } = await context();
  if (!user) return { status: "error" };

  const service = createServiceRoleClient();
  const { data: group, error: groupError } = await service
    .from("groups")
    .select("id")
    .eq("invite_code", inviteCode.data)
    .maybeSingle();

  if (groupError || !group) {
    if (groupError) console.error("Loading invitation group failed", groupError.message);
    return { status: "error" };
  }

  const { error: membershipError } = await service.from("group_members").upsert(
    {
      group_id: group.id,
      user_id: user.id,
      role: "member",
    },
    { onConflict: "group_id,user_id", ignoreDuplicates: true }
  );

  if (membershipError) {
    console.error("Joining group from invitation failed", membershipError.message);
    return { status: "error" };
  }

  // A user may have an older payment request for this group. Keep its audit
  // record, but remove it from the manager's pending queue now that the invite
  // has granted membership.
  const { error: requestError } = await service
    .from("group_join_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: null,
    })
    .eq("group_id", group.id)
    .eq("user_id", user.id)
    .eq("status", "pending_payment");

  if (requestError) {
    console.error("Closing invitation join request failed", requestError.message);
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function approveGroupJoinRequest(formData: FormData): Promise<void> {
  const groupId = uuid.safeParse(formData.get("groupId"));
  const requestId = uuid.safeParse(formData.get("requestId"));
  if (!groupId.success || !requestId.success) return;
  const { db, user } = await context();
  if (!user || !(await canManage(db, user, groupId.data))) return;

  const service = createServiceRoleClient();
  const { data: request } = await service
    .from("group_join_requests")
    .select("user_id, status")
    .eq("id", requestId.data)
    .eq("group_id", groupId.data)
    .maybeSingle();
  if (!request || request.status !== "pending_payment") return;

  const { error } = await service.from("group_members").upsert(
    { group_id: groupId.data, user_id: request.user_id, role: "member" },
    { onConflict: "group_id,user_id", ignoreDuplicates: true }
  );
  if (error) return;
  await service
    .from("group_join_requests")
    .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq("id", requestId.data);
  revalidatePath("/", "layout");
}

export async function declineGroupJoinRequest(formData: FormData): Promise<void> {
  const groupId = uuid.safeParse(formData.get("groupId"));
  const requestId = uuid.safeParse(formData.get("requestId"));
  if (!groupId.success || !requestId.success) return;
  const { db, user } = await context();
  if (!user || !(await canManage(db, user, groupId.data))) return;
  await createServiceRoleClient()
    .from("group_join_requests")
    .update({ status: "declined", reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq("id", requestId.data)
    .eq("group_id", groupId.data);
  revalidatePath("/", "layout");
}

export async function updateGroupPayment(
  _previous: GroupActionState,
  formData: FormData
): Promise<GroupActionState> {
  const groupId = uuid.safeParse(formData.get("groupId"));
  const payment = parseGroupPaymentForm(formData);
  if (!groupId.success || !payment.success) {
    return { status: "error", code: "invalidPayment" };
  }

  const { db, user } = await context();
  if (!user || !(await canManage(db, user, groupId.data))) {
    return { status: "error", code: "notAllowed" };
  }

  const service = createServiceRoleClient();
  const { data: group, error: groupError } = await service
    .from("groups")
    .select("entry_fee_agorot")
    .eq("id", groupId.data)
    .maybeSingle();
  if (groupError || !group) {
    if (groupError) console.error("Loading group payment fee failed", groupError.message);
    return { status: "error", code: "generic" };
  }
  if ((payment.data.bitUrl || payment.data.payboxUrl) && group.entry_fee_agorot <= 0) {
    return { status: "error", code: "invalidPayment" };
  }

  const { error } = await service
    .from("groups")
    .update({
      bit_payment_url: payment.data.bitUrl,
      paybox_payment_url: payment.data.payboxUrl,
      payment_note: payment.data.note,
    })
    .eq("id", groupId.data);
  if (error) {
    console.error("Updating group payment failed", error.message);
    return { status: "error", code: "generic" };
  }

  revalidatePath("/", "layout");
  return { status: "success", code: "paymentSaved" };
}

async function managerCount(groupId: string): Promise<number> {
  const { count } = await createServiceRoleClient().from("group_members")
    .select("user_id", { count: "exact", head: true })
    .eq("group_id", groupId).eq("role", "manager");
  return count ?? 0;
}

export async function changeGroupMemberRole(formData: FormData): Promise<void> {
  const groupId = uuid.parse(formData.get("groupId"));
  const memberId = uuid.parse(formData.get("memberId"));
  const role = z.enum(["member", "manager"]).parse(formData.get("role"));
  const { db, user } = await context();
  if (!user || !(await canManage(db, user, groupId))) return;
  const service = createServiceRoleClient();
  const { data: target } = await service.from("group_members").select("role")
    .eq("group_id", groupId).eq("user_id", memberId).maybeSingle();
  if (target?.role === "manager" && role === "member" && (await managerCount(groupId)) <= 1) return;
  await service.from("group_members").update({ role })
    .eq("group_id", groupId).eq("user_id", memberId);
  revalidatePath("/", "layout");
}

export async function removeGroupMember(formData: FormData): Promise<void> {
  const groupId = uuid.parse(formData.get("groupId"));
  const memberId = uuid.parse(formData.get("memberId"));
  const { db, user } = await context();
  if (!user || !(await canManage(db, user, groupId))) return;
  const service = createServiceRoleClient();
  const { data: target } = await service.from("group_members").select("role")
    .eq("group_id", groupId).eq("user_id", memberId).maybeSingle();
  if (target?.role === "manager" && (await managerCount(groupId)) <= 1) return;
  await service.from("group_members").delete()
    .eq("group_id", groupId).eq("user_id", memberId);
  revalidatePath("/", "layout");
}

export async function deleteManagedGroup(formData: FormData): Promise<void> {
  const groupId = uuid.parse(formData.get("groupId"));
  const { db, user } = await context();
  if (!user || !(await canManage(db, user, groupId))) return;
  const service = createServiceRoleClient();
  const { error: storageError } = await service.storage
    .from("group-images")
    .remove([`${groupId}/cover`]);
  if (storageError) console.error("Removing deleted group image failed", storageError.message);
  await service.from("groups").delete().eq("id", groupId);
  revalidatePath("/", "layout");
}
