import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeaderboard,
  memberIdsForGroup,
  type GroupMembership,
} from "./ranking.ts";

const memberships: GroupMembership[] = [
  { groupId: "family", userId: "me" },
  { groupId: "family", userId: "shared-friend" },
  { groupId: "work", userId: "me" },
  { groupId: "work", userId: "shared-friend" },
  { groupId: "work", userId: "colleague" },
];

const pickVisual = {
  championNameEn: "Barcelona",
  championNameHe: "ברצלונה",
  championLogoUrl: "https://example.test/barcelona.svg",
  scorerNameEn: "Robert Lewandowski",
  scorerNameHe: "רוברט לבנדובסקי",
  scorerPhotoUrl: "https://example.test/lewandowski.png",
};

test("single-group scope contains only that group's members", () => {
  assert.deepEqual(memberIdsForGroup(memberships, "family"), [
    "me",
    "shared-friend",
  ]);
});

test("global table includes every player, including one outside all groups", () => {
  const rows = buildLeaderboard({
    eligibleUserIds: ["me", "shared-friend", "colleague", "solo-player"],
    profiles: [
      { id: "me", displayName: "Me", avatarUrl: null },
      {
        id: "shared-friend",
        displayName: "Shared",
        avatarUrl: null,
      },
      { id: "colleague", displayName: "Colleague", avatarUrl: null },
      { id: "solo-player", displayName: "Solo", avatarUrl: null },
    ],
    scores: [
      {
        userId: "solo-player",
        totalPoints: 3,
        exactScore: true,
        correctOutcome: true,
      },
    ],
    seasonPicks: [],
    viewerUserId: "me",
    currentSeason: 2025,
    picksRevealed: false,
  });

  assert.equal(rows.length, 4);
  assert.equal(rows[0]?.userId, "solo-player");
  assert.equal(rows[0]?.points, 3);
  assert.equal(rows[0]?.settled, 1);
  assert.equal(rows.find((row) => row.userId === "me")?.points, 0);
});

test("point ties are ordered alphabetically with consecutive ranks", () => {
  const rows = buildLeaderboard({
    eligibleUserIds: ["gimel", "alef", "bet"],
    profiles: [
      { id: "gimel", displayName: "גדי", avatarUrl: null },
      { id: "alef", displayName: "אבי", avatarUrl: null },
      { id: "bet", displayName: "בני", avatarUrl: null },
    ],
    scores: [],
    seasonPicks: [],
    viewerUserId: "alef",
    currentSeason: 2025,
    picksRevealed: false,
  });

  assert.deepEqual(
    rows.map(({ displayName, rank }) => ({ displayName, rank })),
    [
      { displayName: "אבי", rank: 1 },
      { displayName: "בני", rank: 2 },
      { displayName: "גדי", rank: 3 },
    ]
  );
});

test("season-pick points use the same group scope as match points", () => {
  const rows = buildLeaderboard({
    eligibleUserIds: memberIdsForGroup(memberships, "family"),
    profiles: [
      { id: "me", displayName: "Me", avatarUrl: null },
      {
        id: "shared-friend",
        displayName: "Shared",
        avatarUrl: null,
      },
      { id: "colleague", displayName: "Colleague", avatarUrl: null },
    ],
    scores: [],
    seasonPicks: [
      {
        userId: "shared-friend",
        season: 2025,
        championAwardedPoints: 12,
        scorerAwardedPoints: 8,
        settledAt: "2026-05-31T20:00:00.000Z",
        ...pickVisual,
      },
      {
        userId: "colleague",
        season: 2025,
        championAwardedPoints: 50,
        scorerAwardedPoints: 50,
        settledAt: "2026-05-31T20:00:00.000Z",
        ...pickVisual,
      },
    ],
    viewerUserId: "me",
    currentSeason: 2025,
    picksRevealed: true,
  });

  assert.equal(rows.length, 2);
  const shared = rows.find((row) => row.userId === "shared-friend");
  assert.equal(shared?.points, 20);
  assert.equal(shared?.seasonBonus, 20);
  assert.equal(rows.some((row) => row.userId === "colleague"), false);
});

test("other participants' season picks stay hidden before first kickoff", () => {
  const rows = buildLeaderboard({
    eligibleUserIds: ["me", "friend"],
    profiles: [
      { id: "me", displayName: "Me", avatarUrl: null },
      { id: "friend", displayName: "Friend", avatarUrl: null },
    ],
    scores: [],
    seasonPicks: [
      {
        userId: "me",
        season: 2025,
        championAwardedPoints: 0,
        scorerAwardedPoints: 0,
        settledAt: null,
        ...pickVisual,
      },
    ],
    viewerUserId: "me",
    currentSeason: 2025,
    picksRevealed: false,
  });

  assert.equal(rows.find((row) => row.userId === "me")?.seasonPickState, "visible");
  assert.equal(rows.find((row) => row.userId === "friend")?.seasonPickState, "hidden");
  assert.equal(rows.find((row) => row.userId === "friend")?.seasonPick, null);
});

test("all submitted season picks are visible after first kickoff", () => {
  const rows = buildLeaderboard({
    eligibleUserIds: ["me", "friend"],
    profiles: [
      { id: "me", displayName: "Me", avatarUrl: null },
      { id: "friend", displayName: "Friend", avatarUrl: null },
    ],
    scores: [],
    seasonPicks: [
      {
        userId: "me",
        season: 2025,
        championAwardedPoints: 0,
        scorerAwardedPoints: 0,
        settledAt: null,
        ...pickVisual,
      },
      {
        userId: "friend",
        season: 2025,
        championAwardedPoints: 0,
        scorerAwardedPoints: 0,
        settledAt: null,
        ...pickVisual,
      },
    ],
    viewerUserId: "me",
    currentSeason: 2025,
    picksRevealed: true,
  });

  assert.equal(rows.every((row) => row.seasonPickState === "visible"), true);
});
