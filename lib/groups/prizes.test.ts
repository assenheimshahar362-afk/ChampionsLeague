import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePrizeAmounts,
  parsePrizeDistribution,
  prizeDistributionFromRow,
} from "./prizes.ts";

test("accepts a positive prize distribution totaling exactly 100", () => {
  assert.deepEqual(parsePrizeDistribution(["70", "20", "10"]), [70, 20, 10]);
  assert.deepEqual(parsePrizeDistribution(["100"]), [100]);
});

test("rejects incomplete, empty, zero and oversized distributions", () => {
  assert.equal(parsePrizeDistribution([]), null);
  assert.equal(parsePrizeDistribution(["70", "20"]), null);
  assert.equal(parsePrizeDistribution(["90", "10", "0"]), null);
  assert.equal(parsePrizeDistribution(Array.from({ length: 11 }, () => "10")), null);
});

test("normalizes only valid database values", () => {
  assert.deepEqual(prizeDistributionFromRow([60, 30, 10]), [60, 30, 10]);
  assert.deepEqual(prizeDistributionFromRow([60, 30]), []);
  assert.deepEqual(prizeDistributionFromRow("70,20,10"), []);
});

test("prize amounts preserve the complete pot after rounding", () => {
  const amounts = calculatePrizeAmounts(10001, [70, 20, 10]);
  assert.deepEqual(amounts, [7001, 2000, 1000]);
  assert.equal(amounts.reduce((sum, amount) => sum + amount, 0), 10001);
});
