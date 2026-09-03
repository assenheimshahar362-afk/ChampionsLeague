import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeRatings,
  probabilitiesAsOf,
  probabilitiesFrom,
  ratingsAsOf,
  type PlayedMatch,
} from "./ratings.ts";

const LIVERPOOL = "40";
const YOUNG_BOYS = "569";

function leaguePhaseMatches(): PlayedMatch[] {
  const teams = [
    LIVERPOOL,
    YOUNG_BOYS,
    ...Array.from({ length: 34 }, (_, index) => String(1_000 + index)),
  ];
  let rotation = [...teams];
  const matches: PlayedMatch[] = [];

  for (let round = 0; round < 8; round += 1) {
    const kickoffAt = new Date(Date.UTC(2024, 8, 17 + round * 7, 19)).toISOString();

    for (let index = 0; index < rotation.length / 2; index += 1) {
      const homeTeamId = rotation[index]!;
      const awayTeamId = rotation[rotation.length - 1 - index]!;
      const homeGoals = homeTeamId === LIVERPOOL || awayTeamId === YOUNG_BOYS ? 3 : 1;
      const awayGoals = awayTeamId === LIVERPOOL || homeTeamId === YOUNG_BOYS ? 3 : 0;
      matches.push({ homeTeamId, awayTeamId, homeGoals, awayGoals, kickoffAt });
    }

    rotation = [rotation[0]!, rotation.at(-1)!, ...rotation.slice(1, -1)];
  }

  return matches;
}

const MATCHES = leaguePhaseMatches();

/* ---------------------------------------------------------- probabilities -- */

test("probabilities always sum to exactly one", () => {
  // Anything reading these treats them as a distribution, so a set that did not
  // sum to 1 would be quietly wrong everywhere it was used.
  for (const match of MATCHES) {
    const p = probabilitiesAsOf(
      MATCHES,
      new Date(match.kickoffAt),
      match.homeTeamId,
      match.awayTeamId
    );

    const total = p.home + p.draw + p.away;
    assert.ok(
      Math.abs(total - 1) < 1e-9,
      `probabilities summed to ${total} for ${match.homeTeamId} v ${match.awayTeamId}`
    );
    for (const [key, value] of Object.entries(p)) {
      assert.ok(value > 0 && value < 1, `${key} out of range at ${value}`);
    }
  }
});

test("an unplayed competition falls back to the baseline split", () => {
  const p = probabilitiesFrom(undefined, undefined);
  assert.deepEqual(p, { home: 0.42, draw: 0.28, away: 0.3 });
});

test("home advantage separates two otherwise identical sides", () => {
  const even = { played: 8, strength: 0 };
  const p = probabilitiesFrom(even, even);

  assert.ok(p.home > p.away, "the home side should be favoured");
  assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-9);
});

test("a stronger side is favoured, and more so as the gap widens", () => {
  const weak = { played: 8, strength: -1 };
  const even = { played: 8, strength: 0 };
  const strong = { played: 8, strength: 1.5 };

  const close = probabilitiesFrom(even, even);
  const mismatch = probabilitiesFrom(strong, weak);

  assert.ok(mismatch.home > close.home);
  assert.ok(mismatch.away < close.away);
  // Lopsided ties draw less often than even ones.
  assert.ok(mismatch.draw < close.draw);
});

test("a strong away side can be favoured despite home advantage", () => {
  const p = probabilitiesFrom({ played: 8, strength: -0.8 }, { played: 8, strength: 1.4 });
  assert.ok(p.away > p.home);
});

/* --------------------------------------------------------------- ratings -- */

test("rates a dominant side above a winless side", () => {
  const ratings = computeRatings(MATCHES);

  const liverpool = ratings.get(LIVERPOOL);
  const youngBoys = ratings.get(YOUNG_BOYS);

  assert.ok(liverpool, "Liverpool should be rated");
  assert.ok(youngBoys, "Young Boys should be rated");
  assert.equal(liverpool.played, 8);
  assert.equal(youngBoys.played, 8);

  assert.ok(
    liverpool.strength > youngBoys.strength,
    `Liverpool ${liverpool.strength} should out-rate Young Boys ${youngBoys.strength}`
  );
  assert.ok(liverpool.strength > 0, "the league phase winner should rate above average");
  assert.ok(youngBoys.strength < 0, "the bottom side should rate below average");
});

test("all 36 league-phase teams are rated", () => {
  const ratings = computeRatings(MATCHES);
  assert.equal(ratings.size, 36);
});

/* -------------------------------------------------------------- lookahead -- */

test("ratings ignore matches that had not been played yet", () => {
  // The whole reason ratings are computed from results rather than the
  // standings snapshot: that snapshot is the FINAL table, and using it in
  // September would leak the rest of the season into September's ratings.
  const firstKickoff = MATCHES.reduce(
    (earliest, m) =>
      new Date(m.kickoffAt) < new Date(earliest) ? m.kickoffAt : earliest,
    MATCHES[0]!.kickoffAt
  );

  const beforeAnything = ratingsAsOf(MATCHES, new Date(firstKickoff));
  assert.equal(beforeAnything.size, 0, "nothing is known before the first match");

  const afterRound1 = ratingsAsOf(MATCHES, new Date("2024-09-20T00:00:00Z"));
  const afterSeason = ratingsAsOf(MATCHES, new Date("2025-02-01T00:00:00Z"));

  for (const rating of afterRound1.values()) {
    assert.ok(rating.played <= 1, "only matchday 1 should count on 20 September");
  }
  assert.equal(afterSeason.get(LIVERPOOL)?.played, 8);
});

test("matchday one is rated at the baseline, not on hindsight", () => {
  const md1 = MATCHES.filter((m) => m.kickoffAt.startsWith("2024-09-17"))[0]!;

  const p = probabilitiesAsOf(
    MATCHES,
    new Date(md1.kickoffAt),
    md1.homeTeamId,
    md1.awayTeamId
  );

  assert.deepEqual(p, { home: 0.42, draw: 0.28, away: 0.3 });
});

test("confidence shrinks a hot start toward average", () => {
  const oneBigWin: PlayedMatch[] = [
    {
      homeTeamId: "a",
      awayTeamId: "b",
      homeGoals: 5,
      awayGoals: 0,
      kickoffAt: "2024-09-17T19:00:00+00:00",
    },
  ];

  const after1 = computeRatings(oneBigWin).get("a")!;

  const repeated: PlayedMatch[] = Array.from({ length: 8 }, (_, i) => ({
    homeTeamId: "a",
    awayTeamId: `opp${i}`,
    homeGoals: 5,
    awayGoals: 0,
    kickoffAt: `2024-09-${17 + i}T19:00:00+00:00`,
  }));

  const after8 = computeRatings(repeated).get("a")!;

  // Same per-game record, but eight matches of it is worth more than one.
  assert.ok(
    after8.strength > after1.strength,
    `8 matches (${after8.strength}) should out-rate 1 (${after1.strength})`
  );
});
