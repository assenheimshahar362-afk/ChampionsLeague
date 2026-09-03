import assert from "node:assert/strict";
import test from "node:test";

import { getUploadedAvatarUrl } from "./avatar.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";

test("keeps avatars uploaded to the app bucket", () => {
  const avatarUrl =
    "https://project.supabase.co/storage/v1/object/public/avatars/user-id/avatar?v=123";

  assert.equal(getUploadedAvatarUrl(avatarUrl), avatarUrl);
});

test("ignores Google account pictures so the identicon is used", () => {
  const googlePicture = "https://lh3.googleusercontent.com/a/example";

  assert.equal(getUploadedAvatarUrl(googlePicture), null);
});

test("rejects an attacker host that copies the Supabase storage path", () => {
  assert.equal(
    getUploadedAvatarUrl(
      "https://attacker.example/storage/v1/object/public/avatars/user-id/avatar"
    ),
    null
  );
});

test("ignores missing and malformed avatar URLs", () => {
  assert.equal(getUploadedAvatarUrl(null), null);
  assert.equal(getUploadedAvatarUrl("not-a-url"), null);
});
