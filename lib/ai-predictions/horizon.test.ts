import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_PREDICTION_HORIZON_HOURS,
  aiPredictionFixtureAvailability,
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

  it("exposes future fixtures while enabling only the next 48 hours", () => {
    const now = Date.parse("2026-09-07T12:00:00.000Z");
    assert.equal(
      aiPredictionFixtureAvailability(
        "scheduled",
        "2026-09-09T11:59:00.000Z",
        now
      ),
      "eligible"
    );
    assert.equal(
      aiPredictionFixtureAvailability(
        "scheduled",
        "2026-09-09T12:01:00.000Z",
        now
      ),
      "too-early"
    );
    assert.equal(
      aiPredictionFixtureAvailability(
        "finished",
        "2026-09-08T12:00:00.000Z",
        now
      ),
      "closed"
    );
  });

  it("enables an upcoming match-week fixture beyond 48 hours", () => {
    const now = Date.parse("2026-09-07T12:00:00.000Z");
    assert.equal(
      aiPredictionFixtureAvailability(
        "scheduled",
        "2026-09-09T20:00:00.000Z",
        now,
        true
      ),
      "eligible"
    );
  });
});
