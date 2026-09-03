import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isLivePollCandidate } from "./live-window.ts";

const NOW = Date.parse("2026-09-16T19:00:00Z");

describe("live poll window", () => {
  it("starts fifteen minutes before kickoff", () => {
    assert.equal(
      isLivePollCandidate(
        { status: "scheduled", kickoffAt: "2026-09-16T19:15:00Z" },
        NOW
      ),
      true
    );
    assert.equal(
      isLivePollCandidate(
        { status: "scheduled", kickoffAt: "2026-09-16T19:16:00Z" },
        NOW
      ),
      false
    );
  });

  it("keeps active matches polling even after the normal time window", () => {
    assert.equal(
      isLivePollCandidate(
        { status: "halftime", kickoffAt: "2026-09-16T12:00:00Z" },
        NOW
      ),
      true
    );
  });

  it("stops after a match is finished", () => {
    assert.equal(
      isLivePollCandidate(
        { status: "finished", kickoffAt: "2026-09-16T19:00:00Z" },
        NOW
      ),
      false
    );
  });
});
