import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_PIVOT_2024,
  DEFAULT_SCALE,
  createRebaser,
  normaliseScale,
} from "./rebase.ts";

const INGEST = new Date("2026-08-21T12:00:00.000Z");
const PIVOT = new Date(DEFAULT_PIVOT_2024);

function rebaser(overrides: Partial<Parameters<typeof createRebaser>[0]> = {}) {
  return createRebaser({
    enabled: true,
    pivot: PIVOT,
    scale: 1,
    ingestTime: INGEST,
    ...overrides,
  });
}

test("disabled rebasing passes timestamps through untouched", () => {
  const rebase = rebaser({ enabled: false });
  const real = "2024-09-17T16:45:00+00:00";

  // This is the 2026/27 production path: REBASE_ENABLED=false must be a true
  // identity, not an approximation.
  assert.equal(rebase(real), real);
});

test("a fixture at the pivot lands exactly on ingest time", () => {
  const rebase = rebaser();
  assert.equal(rebase(DEFAULT_PIVOT_2024), INGEST.toISOString());
});

test("fixtures before the pivot land in the past, after it in the future", () => {
  const rebase = rebaser();

  // League Stage 1 preceded the default pivot, so it must already be settled.
  const md1 = new Date(rebase("2024-09-17T16:45:00+00:00")).getTime();
  assert.ok(md1 < INGEST.getTime(), "matchday 1 should be in the past");

  // The final is the far end of the season and must still be ahead.
  const final = new Date(rebase("2025-05-31T19:00:00+00:00")).getTime();
  assert.ok(final > INGEST.getTime(), "the final should be in the future");
});

test("scale compresses the season without reordering it", () => {
  const real = ["2024-09-17T16:45:00+00:00", "2025-01-21T20:00:00+00:00", "2025-05-31T19:00:00+00:00"];

  const trueSpeed = rebaser({ scale: 1 }).bind(null);
  const compressed = rebaser({ scale: DEFAULT_SCALE });

  const order = (fn: (s: string) => string) =>
    real.map((r) => new Date(fn(r)).getTime());

  const slow = order(trueSpeed);
  const fast = order(compressed);

  // Chronology is preserved at any scale.
  assert.deepEqual(slow, [...slow].sort((a, b) => a - b));
  assert.deepEqual(fast, [...fast].sort((a, b) => a - b));

  // And the compressed season is strictly shorter end to end.
  assert.ok(fast[2]! - fast[0]! < slow[2]! - slow[0]!);
});

test("the default scale replays the season in days, not months", () => {
  const rebase = rebaser({ scale: DEFAULT_SCALE });

  const start = new Date(rebase("2024-09-17T16:45:00+00:00")).getTime();
  const end = new Date(rebase("2025-05-31T19:00:00+00:00")).getTime();
  const days = (end - start) / 86_400_000;

  assert.ok(days > 5 && days < 20, `season replays over ${days.toFixed(1)} days`);
});

test("a nonsensical scale falls back to real time rather than collapsing", () => {
  assert.equal(normaliseScale(0), 1);
  assert.equal(normaliseScale(-3), 1);
  assert.equal(normaliseScale(Number.NaN), 1);
  assert.equal(normaliseScale(0.5), 0.5);
});

test("an unparseable timestamp is passed through, not turned into Invalid Date", () => {
  const rebase = rebaser();
  // One malformed fixture must not be able to abort an entire ingest run.
  assert.equal(rebase("not a date"), "not a date");
});
