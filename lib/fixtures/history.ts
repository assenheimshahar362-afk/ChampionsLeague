import type { Fixture } from "@/lib/fixtures/types";

export type FixtureHistory = {
  headToHead: Fixture[];
  homeRecent: Fixture[];
  awayRecent: Fixture[];
};

function containsTeam(fixture: Fixture, teamId: string): boolean {
  return fixture.homeTeam.id === teamId || fixture.awayTeam.id === teamId;
}

/** Selects only released past results; withheld replay outcomes never enter. */
export function buildFixtureHistory(
  fixtures: Fixture[],
  current: Fixture,
  limit = 5
): FixtureHistory {
  const currentKickoff = new Date(current.kickoffAt).getTime();
  const past = fixtures
    .filter(
      (fixture) =>
        fixture.id !== current.id &&
        fixture.status === "finished" &&
        fixture.homeGoals !== null &&
        fixture.awayGoals !== null &&
        new Date(fixture.kickoffAt).getTime() < currentKickoff
    )
    .sort(
      (a, b) =>
        new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime()
    );

  const homeId = current.homeTeam.id;
  const awayId = current.awayTeam.id;

  return {
    headToHead: past
      .filter(
        (fixture) =>
          containsTeam(fixture, homeId) && containsTeam(fixture, awayId)
      )
      .slice(0, limit),
    homeRecent: past.filter((fixture) => containsTeam(fixture, homeId)).slice(0, limit),
    awayRecent: past.filter((fixture) => containsTeam(fixture, awayId)).slice(0, limit),
  };
}
