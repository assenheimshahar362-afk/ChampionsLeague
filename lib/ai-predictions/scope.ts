export type AiPredictionScope =
  | "horizon"
  | "upcoming-round"
  | "horizon-or-upcoming-round";

type ScheduledFixture = {
  season: number;
  round: string;
  kickoff_at: string;
};

/** Selects the whole match week represented by the nearest upcoming round. */
export function upcomingMatchWeekFixtures<T extends ScheduledFixture>(
  fixtures: T[]
): T[] {
  const ordered = [...fixtures].sort((left, right) =>
    left.kickoff_at.localeCompare(right.kickoff_at)
  );
  const nextFixture = ordered[0];
  if (!nextFixture) return [];

  return ordered.filter(
    (fixture) =>
      fixture.season === nextFixture.season &&
      fixture.round === nextFixture.round
  );
}

export function fixturesForPredictionScope<T extends ScheduledFixture>(
  fixtures: T[],
  scope: AiPredictionScope,
  horizonEnd: string
): T[] {
  const ordered = [...fixtures].sort((left, right) =>
    left.kickoff_at.localeCompare(right.kickoff_at)
  );
  if (scope === "horizon") {
    return ordered.filter((fixture) => fixture.kickoff_at <= horizonEnd);
  }

  const upcomingWeek = upcomingMatchWeekFixtures(ordered);
  if (scope === "upcoming-round") return upcomingWeek;

  const upcomingWeekIds = new Set(upcomingWeek);
  return ordered.filter(
    (fixture) =>
      fixture.kickoff_at <= horizonEnd || upcomingWeekIds.has(fixture)
  );
}
