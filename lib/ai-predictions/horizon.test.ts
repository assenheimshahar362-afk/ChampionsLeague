import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_PREDICTION_HORIZON_HOURS,
  aiPredictionHorizonHours,
} from "./horizon.ts";

describe("AI prediction horizon", () => {
  it("defaults to two days", () => {
    assert.equal(AI_PREDICTION_HORIZON_HOURS, 48);
    assert.equal(aiPredictionHorizonHours(), 48);
    assert.equal(aiPredictionHorizonHours(null), 48);
  });

  it("allows a shorter manual window", () => {
    assert.equal(aiPredictionHorizonHours(24), 24);
    assert.equal(aiPredictionHorizonHours(0), 1);
  });

  it("never allows generation beyond two days", () => {
    assert.equal(aiPredictionHorizonHours(168), 48);
    assert.equal(aiPredictionHorizonHours(Number.NaN), 48);
  });
});