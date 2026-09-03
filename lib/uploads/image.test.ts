import assert from "node:assert/strict";
import test from "node:test";

import { detectImageMime } from "./image.ts";

test("detects supported image signatures", () => {
  assert.equal(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff])), "image/jpeg");
  assert.equal(
    detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/png"
  );
  assert.equal(
    detectImageMime(new TextEncoder().encode("RIFF0000WEBP")),
    "image/webp"
  );
});

test("rejects content that only claims to be an image", () => {
  assert.equal(detectImageMime(new TextEncoder().encode("<script>")), null);
});
