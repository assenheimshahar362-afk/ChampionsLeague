"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeRelativePath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";
import { hasMatchingImageSignature } from "@/lib/uploads/image";

export type NicknameState =
  | { status: "idle" }
  | { status: "error"; code: "invalid" | "taken" | "notSignedIn" | "generic" };

export type AvatarState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      code: "missing" | "invalidType" | "tooLarge" | "notSignedIn" | "generic";
    };

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const nicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .regex(/^[\p{L}\p{N} _.\-]+$/u)
  .refine((value) => /\p{L}/u.test(value));

export async function saveNickname(
  _previous: NicknameState,
  formData: FormData
): Promise<NicknameState> {
  const parsed = nicknameSchema.safeParse(formData.get("nickname"));
  if (!parsed.success) return { status: "error", code: "invalid" };

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { status: "error", code: "notSignedIn" };

  const { error } = await db
    .from("profiles")
    .upsert({
      id: user.id,
      display_name: parsed.data,
      nickname_confirmed_at: new Date().toISOString(),
    });

  if (error) {
    if (error.code === "23505") return { status: "error", code: "taken" };
    console.error("Saving nickname failed", error.message);
    return { status: "error", code: "generic" };
  }

  redirect(safeRelativePath(String(formData.get("next") ?? "")));
}

export async function saveAvatar(
  _previous: AvatarState,
  formData: FormData
): Promise<AvatarState> {
  const avatar = formData.get("avatar");
  if (!(avatar instanceof File) || avatar.size === 0) {
    return { status: "error", code: "missing" };
  }
  if (!AVATAR_MIME_TYPES.has(avatar.type)) {
    return { status: "error", code: "invalidType" };
  }
  if (avatar.size > MAX_AVATAR_BYTES) {
    return { status: "error", code: "tooLarge" };
  }
  if (!(await hasMatchingImageSignature(avatar))) {
    return { status: "error", code: "invalidType" };
  }

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { status: "error", code: "notSignedIn" };

  // One stable object per user avoids abandoned files. The query parameter on
  // the public URL changes after every upload, so browsers do not keep showing
  // a cached copy of the previous image.
  const objectPath = `${user.id}/avatar`;
  const { error: uploadError } = await db.storage
    .from("avatars")
    .upload(objectPath, avatar, {
      cacheControl: "3600",
      contentType: avatar.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("Uploading profile avatar failed", uploadError.message);
    return { status: "error", code: "generic" };
  }

  const { data: publicAvatar } = db.storage
    .from("avatars")
    .getPublicUrl(objectPath);
  const avatarUrl = `${publicAvatar.publicUrl}?v=${Date.now()}`;
  const { error: profileError } = await db
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (profileError) {
    console.error("Saving profile avatar URL failed", profileError.message);
    return { status: "error", code: "generic" };
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}
