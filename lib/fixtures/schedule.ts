export type FixtureScheduleItem = {
  season?: number;
  round: string;
  kickoffAt: string;
  status?: string;
};

export type FixtureRoundSelection = Pick<
  FixtureScheduleItem,
  "season" | "round"
>;

/** Keeps the selected round whole, then every later round in kickoff order. */
export function currentAndFutureRoundItems<T extends FixtureScheduleItem>(
  fixtures: T[],
  selected: FixtureRoundSelection
): T[] {
  const seasonFixtures = fixtures
    .filter((fixture) => fixture.season === selected.season)
    .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt));
  const roundOrder = [
    ...new Set(seasonFixtures.map((fixture) => fixture.round)),
  ];
  const selectedIndex = roundOrder.indexOf(selected.round);
  const remainingRounds = new Set(
    roundOrder.slice(Math.max(0, selectedIndex))
  );

  return seasonFixtures.filter((fixture) => remainingRounds.has(fixture.round));
}

/** Mirrors the home page's nearest-upcoming-round selection and season fallback. */
export function currentRoundSelection<T extends FixtureScheduleItem>(
  fixtures: T[],
  nowMs: number
): FixtureRoundSelection | null {
  const ordered = [...fixtures].sort((left, right) =>
    left.kickoffAt.localeCompare(right.kickoffAt)
  );
  const selected =
    ordered.find(
      (fixture) => fixture.status === "live" || fixture.status === "halftime"
    ) ??
    ordered.find(
      (fixture) =>
        fixture.status !== "cancelled" &&
        new Date(fixture.kickoffAt).getTime() > nowMs
    ) ??
    ordered.at(-1);

  return selected
    ? { season: selected.season, round: selected.round }
    : null;
}

/**
 * Initial home-page payload: everything that has started plus the active or
 * nearest upcoming round in full. Later rounds stay on the server until the
 * visitor explicitly asks for one.
 */
export function initialHomeRoundItems<T extends FixtureScheduleItem>(
  fixtures: T[],
  nowMs: number
): {
  items: T[];
  selected: FixtureRoundSelection | null;
  remainingRoundCount: number;
} {
  const selected = currentRoundSelection(fixtures, nowMs);
  if (!selected) return { items: [], selected: null, remainingRoundCount: 0 };

  const ordered = fixtures
    .filter((fixture) => fixture.season === selected.season)
    .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt));
  const roundOrder = [...new Set(ordered.map((fixture) => fixture.round))];
  const selectedIndex = Math.max(0, roundOrder.indexOf(selected.round));
  const visibleRounds = new Set(roundOrder.slice(0, selectedIndex + 1));

  return {
    items: ordered.filter((fixture) => visibleRounds.has(fixture.round)),
    selected,
    remainingRoundCount: Math.max(0, roundOrder.length - selectedIndex - 1),
  };
}

/** Returns exactly one complete round after the supplied round cursor. */
export function nextRoundItems<T extends FixtureScheduleItem>(
  fixtures: T[],
  cursor: FixtureRoundSelection
): { items: T[]; remainingRoundCount: number } {
  const ordered = fixtures
    .filter((fixture) => fixture.season === cursor.season)
    .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt));
  const roundOrder = [...new Set(ordered.map((fixture) => fixture.round))];
  const cursorIndex = roundOrder.indexOf(cursor.round);
  const nextIndex = cursorIndex + 1;
  const nextRound = cursorIndex >= 0 ? roundOrder[nextIndex] : undefined;

  return {
    items: nextRound
      ? ordered.filter((fixture) => fixture.round === nextRound)
      : [],
    remainingRoundCount: nextRound
      ? Math.max(0, roundOrder.length - nextIndex - 1)
      : 0,
  };
}
