import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseEntryFeeAgorot } from "./fees.ts";

describe("parseEntryFeeAgorot", () => {
  it("stores whole and fractional shekels as agorot", () => {
    assert.equal(parseEntryFeeAgorot("0"), 0);
    assert.equal(parseEntryFeeAgorot("25"), 2_500);
    assert.equal(parseEntryFeeAgorot("25.5"), 2_550);
    assert.equal(parseEntryFeeAgorot("25,05"), 2_505);
  });

  it("rejects negative, over-precise and excessive fees", () => {
    assert.equal(parseEntryFeeAgorot("-1"), null);
    assert.equal(parseEntryFeeAgorot("1.001"), null);
    assert.equal(parseEntryFeeAgorot("1000000.01"), null);
    assert.equal(parseEntryFeeAgorot("not money"), null);
  });
});
