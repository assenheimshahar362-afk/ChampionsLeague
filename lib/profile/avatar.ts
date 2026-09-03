const UPLOADED_AVATAR_PATH = "/storage/v1/object/public/avatars/";

/**
 * Only images uploaded through the profile form override the generated
 * identicon. OAuth providers also expose an avatar URL, but that is account
 * metadata rather than a picture the player chose for this app.
 */
export function getUploadedAvatarUrl(
  avatarUrl: string | null | undefined
): string | null {
  if (!avatarUrl) return null;

  try {
    const url = new URL(avatarUrl);
    const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!configuredUrl) return null;
    const storageOrigin = new URL(configuredUrl).origin;
    return url.origin === storageOrigin &&
      url.pathname.startsWith(UPLOADED_AVATAR_PATH)
      ? avatarUrl
      : null;
  } catch {
    return null;
  }
}
