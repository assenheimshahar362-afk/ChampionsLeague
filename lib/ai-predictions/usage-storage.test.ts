import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isMissingCacheWriteTokensColumn } from "./usage-storage.ts";

describe("AI usage storage compatibility", () => {
  it("recognizes a stale PostgREST schema cache for the new token column", () => {
    assert.equal(
      isMissingCacheWriteTokensColumn({
        code: "PGRST204",
        message: "Could not find the 'cache_write_tokens' column in the schema cache",
      }),
      true
    );
  });

  it("does not hide unrelated database failures", () => {
    assert.equal(
      isMissingCacheWriteTokensColumn({
        code: "23514",
        message: "check constraint failed",
      }),
      false
    );
  });
});
