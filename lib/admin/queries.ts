import "server-only";

import {
  openPredictionFixtureIds,
  participantCompletionByUser,
} from "@/lib/admin/completeness";
import { serverEnv } from "@/lib/env.server";
import { groupPaymentSettingsFromRow } from "@/lib/groups/payment";
import { aiPredictionFixtureAvailability } from "@/lib/ai-predictions/horizon";
import {
  currentAndFutureRoundItems,
  currentRoundSelection,
} from "@/lib/fixtures/schedule";
import { getGameSettingsAsAdmin } from "@/lib/scoring/settings";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type AdminPredictionRow = Pick<
  Database["public"]["Tables"]["predictions"]["Row"],
  "user_id" | "fixture_id"
>;

type AdminSeasonPickRow = Pick<
  Database["public"]["Tables"]["season_picks"]["Row"],
  | "user_id"
  | "season"
  | "champion_candidate_id"
  | "top_scorer_candidate_id"
  | "champion_awarded_points"
  | "scorer_awarded_points"
  | "settled_at"
>;

async function loadAllAdminPredictions(
  db: ReturnType<typeof createServiceRoleClient>
) {
  const rows: AdminPredictionRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const result = await db
      .from("predictions")
      .select("user_id, fixture_id")
      .range(from, from + pageSize - 1);
    if (result.error) return { data: rows, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) {
      return { data: rows, error: null };
    }
  }
}

async function loadAllAdminSeasonPicks(
  db: ReturnType<typeof createServiceRoleClient>
) {
  const rows: AdminSeasonPickRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const result = await db
      .from("season_picks")
      .select(
        "user_id, season, champion_candidate_id, top_scorer_candidate_id, champion_awarded_points, scorer_awarded_points, settled_at"
      )
      .range(from, from + pageSize - 1);
    if (result.error) return { data: rows, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) {
      return { data: rows, error: null };
    }
  }
}

export async function getAdminOverview() {
  const db = createServiceRoleClient();
  const env = serverEnv();
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
    aiPredictionsResult,
    aiUsageResult,
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
    db.from("teams").select("id, name, short_name, code, color, logo_url"),
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
    loadAllAdminPredictions(db),
    db.from("prediction_scores").select("user_id, fixture_id, total_points"),
    loadAllAdminSeasonPicks(db),
    db.from("fixture_results").select("fixture_id, released_at"),
    db
      .from("ai_match_predictions")
      .select("*"),
    db
      .from("ai_prediction_usage")
      .select("*")
      .order("created_at", { ascending: false }),
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
    ["AI match predictions", aiPredictionsResult],
    ["AI prediction usage", aiUsageResult],
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
  const aiPredictions = aiPredictionsResult.data ?? [];
  const aiUsage = aiUsageResult.data ?? [];

  const profileById = new Map(profiles.map((row) => [row.id, row]));
  const authById = new Map(authResult.data.users.map((user) => [user.id, user]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const releasedByFixture = new Map(
    results.map((result) => [result.fixture_id, result.released_at])
  );
  const aiPredictionByFixture = new Map(
    aiPredictions.map((prediction) => [prediction.fixture_id, prediction])
  );
  const latestCompletedAiUsageByFixture = new Map<
    string,
    (typeof aiUsage)[number]
  >();
  for (const usage of aiUsage) {
    if (
      usage.status === "completed" &&
      !latestCompletedAiUsageByFixture.has(usage.fixture_id)
    ) {
      latestCompletedAiUsageByFixture.set(usage.fixture_id, usage);
    }
  }

  const openFixtureIds = openPredictionFixtureIds(
    fixtures,
    env.FOOTBALL_DATA_SEASON,
    Date.now()
  );
  const completionByUser = participantCompletionByUser(
    authResult.data.users.map((user) => user.id),
    env.FOOTBALL_DATA_SEASON,
    openFixtureIds,
    predictions,
    seasonPicks
  );
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const openPredictionFixtures = openFixtureIds.flatMap((fixtureId) => {
    const fixture = fixtureById.get(fixtureId);
    if (!fixture) return [];
    return [{
      id: fixture.id,
      kickoffAt: fixture.kickoff_at,
      homeTeam: teamById.get(fixture.home_team_id)?.short_name ?? "-",
      awayTeam: teamById.get(fixture.away_team_id)?.short_name ?? "-",
    }];
  });

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
      const completion = completionByUser.get(user.id)!;
      return {
        id: user.id,
        nickname: profile?.display_name ?? "-",
        email: user.email ?? "-",
        avatarUrl: profile?.avatar_url ?? null,
        nicknameConfirmed: Boolean(profile?.nickname_confirmed_at),
        emailConfirmed: Boolean(user.email_confirmed_at),
        groupCount: groupCountByUser.get(user.id) ?? 0,
        predictionCount: predictionCountByUser.get(user.id) ?? 0,
        championPicked: completion.championPicked,
        topScorerPicked: completion.topScorerPicked,
        missingPredictionFixtureIds: completion.missingPredictionFixtureIds,
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

  const predictionWindowStart = Date.now();
  const adminFixtures = fixtures.map((fixture) => {
    const aiPrediction = aiPredictionByFixture.get(fixture.id);
    const aiUsage = latestCompletedAiUsageByFixture.get(fixture.id);
    const homeTeam = teamById.get(fixture.home_team_id);
    const awayTeam = teamById.get(fixture.away_team_id);
    return {
      ...fixture,
      kickoffAt: fixture.kickoff_at,
      homeTeam: homeTeam?.short_name ?? "-",
      awayTeam: awayTeam?.short_name ?? "-",
      homeTeamInfo: {
        id: homeTeam?.id ?? fixture.home_team_id,
        name: homeTeam?.name ?? "-",
        shortName: homeTeam?.short_name ?? "-",
        code: homeTeam?.code ?? "?",
        color: homeTeam?.color ?? "#334155",
        logoUrl: homeTeam?.logo_url ?? null,
      },
      awayTeamInfo: {
        id: awayTeam?.id ?? fixture.away_team_id,
        name: awayTeam?.name ?? "-",
        shortName: awayTeam?.short_name ?? "-",
        code: awayTeam?.code ?? "?",
        color: awayTeam?.color ?? "#334155",
        logoUrl: awayTeam?.logo_url ?? null,
      },
      resultState: releasedByFixture.has(fixture.id)
        ? releasedByFixture.get(fixture.id)
          ? "released"
          : "pending"
        : "missing",
      aiPredictionModel: aiPrediction?.model ?? null,
      aiPredictionGeneratedAt: aiPrediction?.generated_at ?? null,
      aiPredictionDetails: aiPrediction
        ? {
            predictedHomeGoals: aiPrediction.predicted_home_goals,
            predictedAwayGoals: aiPrediction.predicted_away_goals,
            homeWinProbability: aiPrediction.home_win_probability,
            drawProbability: aiPrediction.draw_probability,
            awayWinProbability: aiPrediction.away_win_probability,
            confidence: aiPrediction.confidence,
            summaryEn: aiPrediction.summary_en,
            summaryHe: aiPrediction.summary_he,
            keyFactorsEn: stringArray(aiPrediction.key_factors_en),
            keyFactorsHe: stringArray(aiPrediction.key_factors_he),
            sources: predictionSources(aiPrediction.sources),
          }
        : null,
      aiUsageDetails: aiUsage
        ? {
            inputTokens: aiUsage.input_tokens ?? 0,
            cachedInputTokens: aiUsage.cached_input_tokens ?? 0,
            cacheWriteTokens: aiUsage.cache_write_tokens ?? 0,
            outputTokens: aiUsage.output_tokens ?? 0,
            webSearchCalls: aiUsage.web_search_calls ?? 0,
            reservedCostUsd: aiUsage.budget_charge_microusd / 1_000_000,
            estimatedCostUsd:
              aiUsage.estimated_cost_microusd === null
                ? null
                : aiUsage.estimated_cost_microusd / 1_000_000,
            completedAt: aiUsage.completed_at,
          }
        : null,
      aiPredictionEstimatedCostUsd:
        aiUsage?.estimated_cost_microusd === null || aiUsage === undefined
          ? null
          : aiUsage.estimated_cost_microusd / 1_000_000,
      aiPredictionAvailability: aiPredictionFixtureAvailability(
        fixture.status,
        fixture.kickoff_at,
        predictionWindowStart
      ),
    };
  });
  const fixtureScheduleSelection = currentRoundSelection(
    adminFixtures,
    predictionWindowStart
  );
  const fixtureSchedule = fixtureScheduleSelection
    ? currentAndFutureRoundItems(adminFixtures, fixtureScheduleSelection)
    : [];

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
      usersMissingSeasonPicks: users.filter(
        (user) => !user.championPicked || !user.topScorerPicked
      ).length,
      usersMissingPredictions: users.filter(
        (user) => user.missingPredictionFixtureIds.length > 0
      ).length,
    },
    users,
    openPredictionFixtures,
    groups: adminGroups,
    fixtures: fixtureSchedule,
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
    aiCosts: {
      budgetLimitUsd: env.OPENAI_PREDICTION_BUDGET_USD,
      budgetCommittedUsd:
        aiUsage.reduce(
          (sum, row) => sum + row.budget_charge_microusd,
          0
        ) / 1_000_000,
      budgetRemainingUsd: Math.max(
        0,
        env.OPENAI_PREDICTION_BUDGET_USD -
          aiUsage.reduce(
            (sum, row) => sum + row.budget_charge_microusd,
            0
          ) /
            1_000_000
      ),
      totalEstimatedUsd:
        aiUsage.reduce(
          (sum, row) => sum + (row.estimated_cost_microusd ?? 0),
          0
        ) / 1_000_000,
      completedCalls: aiUsage.filter((row) => row.status === "completed").length,
      reservedCalls: aiUsage.filter((row) => row.status === "reserved").length,
      inputTokens: aiUsage.reduce(
        (sum, row) => sum + (row.input_tokens ?? 0),
        0
      ),
      cachedInputTokens: aiUsage.reduce(
        (sum, row) => sum + (row.cached_input_tokens ?? 0),
        0
      ),
      outputTokens: aiUsage.reduce(
        (sum, row) => sum + (row.output_tokens ?? 0),
        0
      ),
      cacheWriteTokens: aiUsage.reduce(
        (sum, row) => sum + (row.cache_write_tokens ?? 0),
        0
      ),
      webSearchCalls: aiUsage.reduce(
        (sum, row) => sum + (row.web_search_calls ?? 0),
        0
      ),
    },
    teamCandidates: (teamCandidatesResult.data ?? []).map((candidate) => ({
      ...candidate,
      name: candidate.name_en,
    })),
    playerCandidates: playerCandidatesResult.data ?? [],
  };
}

function stringArray(value: Json): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function predictionSources(value: Json): Array<{ title: string; url: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((source) => {
    if (
      typeof source !== "object" ||
      source === null ||
      Array.isArray(source) ||
      typeof source.title !== "string" ||
      typeof source.url !== "string"
    ) {
      return [];
    }
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") return [];
      return [{ title: source.title, url: url.toString() }];
    } catch {
      return [];
    }
  });
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
