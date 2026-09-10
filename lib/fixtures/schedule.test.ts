import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  currentAndFutureRoundItems,
  currentRoundSelection,
  initialHomeRoundItems,
  nextRoundItems,
} from "./schedule.ts";

const fixtures = [
  { id: "r2-late", season: 2026, round: "Round 2", kickoffAt: "2026-09-09T20:00:00Z" },
  { id: "r1", season: 2026, round: "Round 1", kickoffAt: "2026-09-01T20:00:00Z" },
  { id: "r2-early", season: 2026, round: "Round 2", kickoffAt: "2026-09-09T18:00:00Z" },
  { id: "r3", season: 2026, round: "Round 3", kickoffAt: "2026-09-16T20:00:00Z" },
  { id: "other-season", season: 2025, round: "Round 9", kickoffAt: "2026-09-10T20:00:00Z" },
];

describe("home fixture schedule order", () => {
  it("selects the round containing the nearest future fixture", () => {
    assert.deepEqual(
      currentRoundSelection(fixtures, Date.parse("2026-09-07T12:00:00Z")),
      { season: 2026, round: "Round 2" }
    );
  });

  it("keeps the selected round whole and orders all remaining rounds", () => {
    assert.deepEqual(
      currentAndFutureRoundItems(fixtures, { season: 2026, round: "Round 2" })
        .map((fixture) => fixture.id),
      ["r2-early", "r2-late", "r3"]
    );
  });

  it("falls back to the last round after the season ends", () => {
    assert.deepEqual(
      currentRoundSelection(fixtures, Date.parse("2027-09-07T12:00:00Z")),
      { season: 2026, round: "Round 3" }
    );
  });

  it("loads played rounds and the nearest upcoming round in full", () => {
    const selection = initialHomeRoundItems(
      fixtures,
      Date.parse("2026-09-07T12:00:00Z")
    );

    assert.deepEqual(
      selection.items.map((fixture) => fixture.id),
      ["r1", "r2-early", "r2-late"]
    );
    assert.deepEqual(selection.selected, { season: 2026, round: "Round 2" });
    assert.equal(selection.remainingRoundCount, 1);
  });

  it("prefers an active round over the next scheduled round", () => {
    const activeFixtures = fixtures.map((fixture) =>
      fixture.id === "r2-late" ? { ...fixture, status: "live" } : fixture
    );

    assert.deepEqual(
      currentRoundSelection(
        activeFixtures,
        Date.parse("2026-09-10T12:00:00Z")
      ),
      { season: 2026, round: "Round 2" }
    );
  });

  it("loads one complete later round at a time", () => {
    const next = nextRoundItems(fixtures, {
      season: 2026,
      round: "Round 2",
    });

    assert.deepEqual(
      next.items.map((fixture) => fixture.id),
      ["r3"]
    );
    assert.equal(next.remainingRoundCount, 0);
  });
});
