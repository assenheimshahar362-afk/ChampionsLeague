export type AdminFixtureForCompletion = {
  id: string;
  season: number;
  status: string;
  kickoff_at: string;
};

export type AdminPredictionForCompletion = {
  user_id: string;
  fixture_id: string;
};

export type AdminSeasonPickForCompletion = {
  user_id: string;
  season: number;
  champion_candidate_id: number | null;
  top_scorer_candidate_id: number | null;
};

export type ParticipantCompletion = {
  championPicked: boolean;
  topScorerPicked: boolean;
  missingPredictionFixtureIds: string[];
};

export function openPredictionFixtureIds(
  fixtures: AdminFixtureForCompletion[],
  currentSeason: number,
  nowMs: number
): string[] {
  return fixtures
    .filter(
      (fixture) =>
        fixture.season === currentSeason &&
        fixture.status === "scheduled" &&
        new Date(fixture.kickoff_at).getTime() > nowMs
    )
    .sort((left, right) => left.kickoff_at.localeCompare(right.kickoff_at))
    .map((fixture) => fixture.id);
}

export function participantCompletionByUser(
  userIds: string[],
  currentSeason: number,
  openFixtureIds: string[],
  predictions: AdminPredictionForCompletion[],
  seasonPicks: AdminSeasonPickForCompletion[]
): Map<string, ParticipantCompletion> {
  const predictedFixtureIdsByUser = new Map<string, Set<string>>();
  for (const prediction of predictions) {
    const fixtureIds =
      predictedFixtureIdsByUser.get(prediction.user_id) ?? new Set<string>();
    fixtureIds.add(prediction.fixture_id);
    predictedFixtureIdsByUser.set(prediction.user_id, fixtureIds);
  }

  const seasonPickByUser = new Map(
    seasonPicks
      .filter((pick) => pick.season === currentSeason)
      .map((pick) => [pick.user_id, pick] as const)
  );

  return new Map(
    userIds.map((userId) => {
      const pick = seasonPickByUser.get(userId);
      const predicted = predictedFixtureIdsByUser.get(userId) ?? new Set<string>();
      return [
        userId,
        {
          championPicked: pick?.champion_candidate_id != null,
          topScorerPicked: pick?.top_scorer_candidate_id != null,
          missingPredictionFixtureIds: openFixtureIds.filter(
            (fixtureId) => !predicted.has(fixtureId)
          ),
        },
      ];
    })
  );
}
