import "server-only";

import { serverEnv } from "@/lib/env.server";
import { groupPaymentSettingsFromRow } from "@/lib/groups/payment";
import { getGameSettingsAsAdmin } from "@/lib/scoring/settings";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function getAdminOverview() {
  const db = createServiceRoleClient();
  const [
    authResult,
    profilesResult,
    groupsResult,
    membersResult,
    teamsResult,
    teamCandidatesResult,
    playerCandidatesResult,
    fixturesResult,
    predictionsResult,
    scoresResult,
    seasonPicksResult,
    resultsResult,
    settings,
  ] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db
      .from("profiles")
      .select("id, display_name, avatar_url, nickname_confirmed_at, created_at")
      .order("display_name"),
    db
      .from("groups")
      .select(
        "id, name, created_by, created_at, entry_fee_agorot, bit_payment_url, paybox_payment_url, payment_note"
      )
      .order("name"),
    db
      .from("group_members")
      .select("group_id, user_id, role, joined_at"),
    db.from("teams").select("id, name, short_name"),
    db
      .from("season_team_candidates")
      .select("season, candidate_id, name_en, pick_points, rank")
      .order("rank"),
    db
      .from("season_player_candidates")
      .select("season, candidate_id, name_en, pick_points, rank")
      .order("rank"),
    db
      .from("fixtures")
      .select(
        "id, season, stage, round, kickoff_at, status, home_goals, away_goals, home_team_id, away_team_id, updated_at"
      )
      .order("kickoff_at", { ascending: false }),
    db.from("predictions").select("user_id, fixture_id"),
    db.from("prediction_scores").select("user_id, fixture_id, total_points"),
    db
      .from("season_picks")
      .select(
        "user_id, champion_awarded_points, scorer_awarded_points, settled_at"
      ),
    db.from("fixture_results").select("fixture_id, released_at"),
    getGameSettingsAsAdmin(),
  ]);

  if (authResult.error) {
    throw new Error(`Loading Auth users failed: ${authResult.error.message}`);
  }

  for (const [label, result] of [
    ["profiles", profilesResult],
    ["groups", groupsResult],
    ["group members", membersResult],
    ["teams", teamsResult],
    ["team candidates", teamCandidatesResult],
    ["player candidates", playerCandidatesResult],
    ["fixtures", fixturesResult],
    ["predictions", predictionsResult],
    ["prediction scores", scoresResult],
    ["season picks", seasonPicksResult],
    ["fixture results", resultsResult],
  ] as const) {
    if (result.error) {
      throw new Error(`Loading ${label} failed: ${result.error.message}`);
    }
  }

  const profiles = profilesResult.data ?? [];
  const groups = groupsResult.data ?? [];
  const members = membersResult.data ?? [];
  const teams = teamsResult.data ?? [];
  const fixtures = fixturesResult.data ?? [];
  const predictions = predictionsResult.data ?? [];
  const scores = scoresResult.data ?? [];
  const seasonPicks = seasonPicksResult.data ?? [];
  const results = resultsResult.data ?? [];

  const profileById = new Map(profiles.map((row) => [row.id, row]));
  const authById = new Map(authResult.data.users.map((user) => [user.id, user]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const releasedByFixture = new Map(
    results.map((result) => [result.fixture_id, result.released_at])
  );

  const predictionCountByUser = countBy(predictions, (row) => row.user_id);
  const groupCountByUser = countDistinctBy(
    members,
    (row) => row.user_id,
    (row) => row.group_id
  );
  const matchPointsByUser = sumBy(
    scores,
    (row) => row.user_id,
    (row) => row.total_points
  );
  const seasonPointsByUser = sumBy(
    seasonPicks,
    (row) => row.user_id,
    (row) => row.champion_awarded_points + row.scorer_awarded_points
  );

  const users = authResult.data.users
    .map((user) => {
      const profile = profileById.get(user.id);
      return {
        id: user.id,
        nickname: profile?.display_name ?? "-",
        email: user.email ?? "-",
        avatarUrl: profile?.avatar_url ?? null,
        nicknameConfirmed: Boolean(profile?.nickname_confirmed_at),
        emailConfirmed: Boolean(user.email_confirmed_at),
        groupCount: groupCountByUser.get(user.id) ?? 0,
        predictionCount: predictionCountByUser.get(user.id) ?? 0,
        points:
          (matchPointsByUser.get(user.id) ?? 0) +
          (seasonPointsByUser.get(user.id) ?? 0),
        createdAt: user.created_at ?? profile?.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  const adminGroups = groups.map((group) => {
    const groupMembers = members
      .filter((member) => member.group_id === group.id)
      .map((member) => {
        const profile = profileById.get(member.user_id);
        const auth = authById.get(member.user_id);
        return {
          userId: member.user_id,
          nickname: profile?.display_name ?? "-",
          email: auth?.email ?? "-",
          avatarUrl: profile?.avatar_url ?? null,
          role: member.role,
          joinedAt: member.joined_at,
        };
      })
      .sort(
        (a, b) =>
          (a.role === b.role ? 0 : a.role === "manager" ? -1 : 1) ||
          a.nickname.localeCompare(b.nickname)
      );

    return {
      id: group.id,
      name: group.name,
      created_by: group.created_by,
      created_at: group.created_at,
      entryFeeAgorot: group.entry_fee_agorot,
      payment: groupPaymentSettingsFromRow(group),
      creatorName: profileById.get(group.created_by)?.display_name ?? "-",
      memberCount: groupMembers.length,
      members: groupMembers,
    };
  });

  const adminFixtures = fixtures.map((fixture) => ({
    ...fixture,
    homeTeam: teamById.get(fixture.home_team_id)?.short_name ?? "-",
    awayTeam: teamById.get(fixture.away_team_id)?.short_name ?? "-",
    resultState: releasedByFixture.has(fixture.id)
      ? releasedByFixture.get(fixture.id)
        ? "released"
        : "pending"
      : "missing",
  }));

  const env = serverEnv();
  const totalMatchPoints = scores.reduce(
    (sum, score) => sum + score.total_points,
    0
  );
  const totalSeasonPoints = seasonPicks.reduce(
    (sum, pick) =>
      sum + pick.champion_awarded_points + pick.scorer_awarded_points,
    0
  );

  return {
    metrics: {
      users: users.length,
      activeUsers: users.filter((user) => user.nicknameConfirmed).length,
      groups: groups.length,
      predictions: predictions.length,
      fixtures: fixtures.length,
      pointsAwarded: totalMatchPoints + totalSeasonPoints,
      pendingResults: results.filter((result) => !result.released_at).length,
    },
    users,
    groups: adminGroups,
    fixtures: adminFixtures,
    settings,
    operations: {
      season: env.FOOTBALL_DATA_SEASON,
      rebaseEnabled: env.REBASE_ENABLED,
      rebaseScale: env.REBASE_SCALE,
      scheduledFixtures: fixtures.filter((fixture) => fixture.status === "scheduled")
        .length,
      finishedFixtures: fixtures.filter((fixture) => fixture.status === "finished")
        .length,
      latestFixtureUpdate:
        fixtures
          .map((fixture) => fixture.updated_at)
          .sort((a, b) => b.localeCompare(a))[0] ?? null,
    },
    teamCandidates: (teamCandidatesResult.data ?? []).map((candidate) => ({
      ...candidate,
      name: candidate.name_en,
    })),
    playerCandidates: playerCandidatesResult.data ?? [],
  };
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function countDistinctBy<T>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => string
) {
  const values = new Map<string, Set<string>>();
  for (const row of rows) {
    const rowKey = key(row);
    const bucket = values.get(rowKey) ?? new Set<string>();
    bucket.add(value(row));
    values.set(rowKey, bucket);
  }
  return new Map([...values].map(([rowKey, bucket]) => [rowKey, bucket.size]));
}

function sumBy<T>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => number
) {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const rowKey = key(row);
    sums.set(rowKey, (sums.get(rowKey) ?? 0) + value(row));
  }
  return sums;
}
