export type LeaderboardRow = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
  /** Fixtures scored so far. The denominator behind the points. */
  settled: number;
  /** Called the scoreline exactly — worth twice that fixture's outcome award. */
  exact: number;
  /** Called the right side, whatever the score. Includes the exact ones. */
  correct: number;
  /** Champion and Golden Boot rewards released after the final. */
  seasonBonus: number;
  /** The current season choices, present only when RLS allows them to be read. */
  seasonPick: LeaderboardSeasonPick | null;
  /** Hidden is different from a participant who did not submit a pick. */
  seasonPickState: "visible" | "hidden" | "missing";
  /** Consecutive position after points and alphabetical tie-breaking. */
  rank: number;
};

export type LeaderboardSeasonPick = {
  championNameEn: string;
  championNameHe: string;
  championLogoUrl: string | null;
  scorerNameEn: string;
  scorerNameHe: string;
  scorerPhotoUrl: string | null;
};

export type GroupMembership = {
  groupId: string;
  userId: string;
};

type ProfileRow = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

type ScoreRow = {
  userId: string;
  totalPoints: number;
  exactScore: boolean;
  correctOutcome: boolean;
};

type SeasonPickRow = {
  userId: string;
  season: number;
  championAwardedPoints: number;
  scorerAwardedPoints: number;
  settledAt: string | null;
  championNameEn: string;
  championNameHe: string;
  championLogoUrl: string | null;
  scorerNameEn: string;
  scorerNameHe: string;
  scorerPhotoUrl: string | null;
};

/**
 * Builds the unique member set for one friends group.
 */
export function memberIdsForGroup(
  memberships: GroupMembership[],
  groupId: string
): string[] {
  return [
    ...new Set(
      memberships
        .filter((membership) => membership.groupId === groupId)
        .map((membership) => membership.userId)
    ),
  ];
}

export function buildLeaderboard({
  eligibleUserIds,
  profiles,
  scores,
  seasonPicks,
  viewerUserId,
  currentSeason,
  picksRevealed,
}: {
  eligibleUserIds: string[];
  profiles: ProfileRow[];
  scores: ScoreRow[];
  seasonPicks: SeasonPickRow[];
  viewerUserId: string;
  currentSeason: number | null;
  picksRevealed: boolean;
}): LeaderboardRow[] {
  const eligible = new Set(eligibleUserIds);
  const named = new Map(
    profiles
      .filter((profile) => eligible.has(profile.id))
      .map((profile) => [
        profile.id,
        {
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      ])
  );

  // Seed every eligible profile at zero. The global table represents every
  // registered player, not only players who already have a settled score.
  const tallies = new Map<string, Omit<LeaderboardRow, "rank">>(
    [...named.entries()].map(([userId, profile]) => [
      userId,
      {
        userId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        points: 0,
        settled: 0,
        exact: 0,
        correct: 0,
        seasonBonus: 0,
        seasonPick: null,
        seasonPickState:
          userId === viewerUserId || picksRevealed ? "missing" : "hidden",
      },
    ])
  );

  for (const row of scores) {
    const profile = named.get(row.userId);
    if (!profile) continue;

    const tally = tallies.get(row.userId);
    if (!tally) continue;

    tally.points += row.totalPoints;
    tally.settled += 1;
    if (row.exactScore) tally.exact += 1;
    if (row.correctOutcome) tally.correct += 1;

    tallies.set(row.userId, tally);
  }

  for (const row of seasonPicks) {
    const profile = named.get(row.userId);
    if (!profile) continue;

    const tally = tallies.get(row.userId);
    if (!tally) continue;

    if (row.season === currentSeason) {
      tally.seasonPick = {
        championNameEn: row.championNameEn,
        championNameHe: row.championNameHe,
        championLogoUrl: row.championLogoUrl,
        scorerNameEn: row.scorerNameEn,
        scorerNameHe: row.scorerNameHe,
        scorerPhotoUrl: row.scorerPhotoUrl,
      };
      tally.seasonPickState = "visible";
    }

    if (row.settledAt) {
      const bonus = row.championAwardedPoints + row.scorerAwardedPoints;
      tally.points += bonus;
      tally.seasonBonus += bonus;
    }
    tallies.set(row.userId, tally);
  }

  const displayNameCollator = new Intl.Collator(["he", "en"], {
    sensitivity: "base",
    numeric: true,
  });
  const ordered = [...tallies.values()].sort(
    (a, b) =>
      b.points - a.points ||
      displayNameCollator.compare(a.displayName, b.displayName) ||
      a.userId.localeCompare(b.userId)
  );

  return ordered.map((row, index) => ({ ...row, rank: index + 1 }));
}
