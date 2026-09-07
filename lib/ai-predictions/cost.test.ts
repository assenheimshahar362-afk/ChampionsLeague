import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estimateOpenAiCostMicrousd } from "./cost.ts";

describe("OpenAI prediction cost", () => {
  it("prices tokens and web searches for Luna", () => {
    const cost = estimateOpenAiCostMicrousd("gpt-5.6-luna", {
      inputTokens: 10_000,
      cachedInputTokens: 2_000,
      cacheWriteTokens: 1_000,
      outputTokens: 2_000,
      webSearchCalls: 4,
    });

    assert.equal(cost, 44_090);
  });

  it("rejects models without configured pricing", () => {
    assert.throws(
      () =>
        estimateOpenAiCostMicrousd("unknown-model", {
          inputTokens: 1,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 1,
          webSearchCalls: 1,
        }),
      /No AI budget pricing configured/
    );
  });
});