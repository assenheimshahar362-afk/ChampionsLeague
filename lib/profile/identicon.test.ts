import assert from "node:assert/strict";
import test from "node:test";

import { createIdenticon } from "./identicon.ts";

test("identicons are stable for the same user", () => {
  assert.deepEqual(createIdenticon("user-123"), createIdenticon("user-123"));
});

test("different users receive different identicons", () => {
  assert.notDeepEqual(createIdenticon("user-123"), createIdenticon("user-456"));
});

test("identicon tiles mirror around the center column", () => {
  const { tiles } = createIdenticon("symmetry-check");

  for (const tile of tiles) {
    const mirror = tiles.find(
      (candidate) =>
        candidate.column === 4 - tile.column &&
        candidate.row === tile.row &&
        candidate.shape === tile.shape &&
        candidate.color === tile.color
    );

    assert.ok(mirror);
  }
});
