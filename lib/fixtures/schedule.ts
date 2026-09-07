export type FixtureScheduleItem = {
  season?: number;
  round: string;
  kickoffAt: string;
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
    ordered.find((fixture) => new Date(fixture.kickoffAt).getTime() > nowMs) ??
    ordered.at(-1);

  return selected
    ? { season: selected.season, round: selected.round }
    : null;
}
