import "server-only";
import { liveScoreRows } from "@/lib/leaderboard/live-scores";
import { ensureAutomaticPredictions } from "@/lib/predictions/automatic-fallback.server";

import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import { teamTranslationKey } from "@/lib/fixtures/localization";
import { AI_PLAYER_ID, buildAiScoreRows } from "@/lib/leaderboard/ai-player";
import {
  buildLeaderboard,
  memberIdsForGroup,
  type GroupMembership,
  type LeaderboardRow,
} from "@/lib/leaderboard/ranking";
import { createClient } from "@/lib/supabase/server";
import { getGameSettings } from "@/lib/scoring/settings";

export type {
  LeaderboardRow,
  LeaderboardSeasonPick,
} from "@/lib/leaderboard/ranking";

export type LeaderboardGroup = {
  id: string;
  name: string;
  entryFeeAgorot: number;
  memberCount: number;
  potAgorot: number;
};

export type LeaderboardView = {
  groups: LeaderboardGroup[];
  selectedGroup: LeaderboardGroup | null;
  rows: LeaderboardRow[];
  currentSeason: number | null;
  picksRevealed: boolean;
  selectedPlayer: LeaderboardPlayerHistory | null;
};

export type LeaderboardPrediction = {
  fixtureId: string;
  kickoffAt: string;
  homeTeam: LeaderboardTeam;
  awayTeam: LeaderboardTeam;
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  actualHomeGoals: number | null;
  actualAwayGoals: number | null;
  points: number | null;
};

export type LeaderboardTeam = {
  nameEn: string;
  nameHe: string;
  logoUrl: string | null;
};

export type LeaderboardPlayerHistory = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isAi: boolean;
  predictions: LeaderboardPrediction[];
};

type PostgrestFailure = { code?: string; message: string };

function isMissingTable(error: PostgrestFailure): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    /Could not find the (table|function)/i.test(error.message)
  );
}

function assertResult(
  table: string,
  result: { error: PostgrestFailure | null }
): void {
  if (!result.error) return;
  if (isMissingTable(result.error)) throw new SchemaNotReadyError(table);
  throw new Error(`Loading ${table} failed: ${result.error.message}`);
}

/**
 * Loads the system-wide champions table by default, including players who do
 * not belong to any friends group. A selected friends group narrows the same
 * user-owned predictions and season picks to that group's roster.
 */
export async function getLeaderboard(
  userId: string,
  requestedGroupId?: string,
  requestedPlayerId?: string
): Promise<LeaderboardView> {
  await ensureAutomaticPredictions();
  const supabase = await createClient();

  const [mine, pickStateResult, gameSettings] = await Promise.all([
    supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId),
    supabase.rpc("current_season_pick_state"),
    getGameSettings(),
  ]);
  assertResult("group_members", mine);
  assertResult("current_season_pick_state", pickStateResult);

  const pickState = pickStateResult.data?.[0] ?? null;
  const currentSeason = pickState?.season ?? null;
  const picksRevealed = pickState?.revealed ?? false;

  const myGroupIds = [...new Set((mine.data ?? []).map((row) => row.group_id))];
  let groups: LeaderboardGroup[] = [];
  let memberships: GroupMembership[] = [];
  if (myGroupIds.length > 0) {
    const [groupsResult, membershipsResult] = await Promise.all([
      supabase
        .from("groups")
        .select("id, name, entry_fee_agorot")
        .in("id", myGroupIds)
        .order("name"),
      supabase
        .from("group_members")
        .select("group_id, user_id")
        .in("group_id", myGroupIds),
    ]);
    assertResult("groups", groupsResult);
    assertResult("group_members", membershipsResult);

    memberships = (membershipsResult.data ?? []).map((membership) => ({
      groupId: membership.group_id,
      userId: membership.user_id,
    }));
    const memberCountByGroup = new Map<string, number>();
    for (const membership of memberships) {
      memberCountByGroup.set(
        membership.groupId,
        (memberCountByGroup.get(membership.groupId) ?? 0) + 1
      );
    }
    groups = (groupsResult.data ?? []).map((group) => {
      const memberCount = memberCountByGroup.get(group.id) ?? 0;
      return {
        id: group.id,
        name: group.name,
        entryFeeAgorot: group.entry_fee_agorot,
        memberCount,
        potAgorot: memberCount * group.entry_fee_agorot,
      };
    });
  }

  // An arbitrary query-string UUID never widens access. If it is not one of
  // the caller's groups, fall back to the system-wide table.
  const selectedGroup =
    groups.find((group) => group.id === requestedGroupId) ?? null;

  let memberIds: string[] | null = null;
  if (selectedGroup) {
    memberIds = memberIdsForGroup(memberships, selectedGroup.id);

    if (memberIds.length === 0) {
      return {
        groups,
        selectedGroup,
        rows: [],
        currentSeason,
        picksRevealed,
        selectedPlayer: null,
      };
    }
  }

  const scoresQuery = supabase
    .from("prediction_scores")
    .select("user_id, fixture_id, total_points, exact_score, correct_outcome");
  const profilesQuery = supabase
    .from("profiles")
    .select("id, display_name, avatar_url");
  const seasonPicksQuery = supabase.rpc(
    "get_visible_leaderboard_season_picks"
  );
  const aiSeasonPicksQuery = supabase.rpc("get_visible_ai_season_picks");
  const startedFixturesQuery = supabase
    .from("fixtures")
    .select(
      "id, kickoff_at, status, home_team_id, away_team_id, home_goals, away_goals, home_win_points, draw_points, away_win_points"
    )
    .lte("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: false });
  const aiPredictionsQuery = supabase
    .from("ai_match_predictions")
    .select("fixture_id, predicted_home_goals, predicted_away_goals");
  const teamsQuery = supabase
    .from("teams")
    .select("id, name, short_name, logo_url");
  const teamTranslationsQuery = supabase
    .from("season_team_candidates")
    .select("season, team_id, name_en, name_he, pick_points");
  const playerCandidatesQuery = supabase
    .from("season_player_candidates")
    .select("season, name_en, pick_points");

  const [scores, profiles, seasonPicks, aiSeasonPicks, startedFixtures, aiPredictions, teams, teamTranslations, playerCandidates] =
    await Promise.all([
    memberIds ? scoresQuery.in("user_id", memberIds) : scoresQuery,
    memberIds ? profilesQuery.in("id", memberIds) : profilesQuery,
    memberIds ? seasonPicksQuery.in("user_id", memberIds) : seasonPicksQuery,
    aiSeasonPicksQuery,
    startedFixturesQuery,
    aiPredictionsQuery,
    teamsQuery,
    teamTranslationsQuery,
    playerCandidatesQuery,
  ]);

  for (const [table, result] of [
    ["prediction_scores", scores],
    ["profiles", profiles],
    ["season_picks", seasonPicks],
    ["AI season picks", aiSeasonPicks],
    ["fixtures", startedFixtures],
    ["ai_match_predictions", aiPredictions],
    ["teams", teams],
    ["season_team_candidates", teamTranslations],
    ["season_player_candidates", playerCandidates],
  ] as const) {
    assertResult(table, result);
  }

  const aiScores = buildAiScoreRows(
    (startedFixtures.data ?? []).map((fixture) => ({
      fixtureId: fixture.id,
      homeGoals: fixture.home_goals,
      awayGoals: fixture.away_goals,
      settled: fixture.status === "finished",
      outcomePoints: {
        home: fixture.home_win_points,
        draw: fixture.draw_points,
        away: fixture.away_win_points,
      },
    })),
    (aiPredictions.data ?? []).map((prediction) => ({
      fixtureId: prediction.fixture_id,
      homeGoals: prediction.predicted_home_goals,
      awayGoals: prediction.predicted_away_goals,
    }))
  );
  const eligibleUserIds = memberIds ?? (profiles.data ?? []).map((profile) => profile.id);
  const liveFixtures = (startedFixtures.data ?? []).filter(f => f.status === "live" || f.status === "halftime");
  const liveIds = liveFixtures.map(f => f.id);
  const livePredictions = liveIds.length
    ? await supabase.from("predictions").select("user_id, fixture_id, home_goals, away_goals").in("fixture_id", liveIds)
    : { data: [], error: null };
  assertResult("predictions", livePredictions);
  const provisionalScores = liveScoreRows(liveFixtures, [
    ...(livePredictions.data ?? []),
    ...(aiPredictions.data ?? []).map(p => ({
      user_id: AI_PLAYER_ID, fixture_id: p.fixture_id,
      home_goals: p.predicted_home_goals, away_goals: p.predicted_away_goals,
    })),
  ]);
  const teamPickPoints = new Map(
    (teamTranslations.data ?? []).map((candidate) => [
      seasonCandidateKey(candidate.season, candidate.name_en),
      candidate.pick_points,
    ])
  );
  const playerPickPoints = new Map(
    (playerCandidates.data ?? []).map((candidate) => [
      seasonCandidateKey(candidate.season, candidate.name_en),
      candidate.pick_points,
    ])
  );
  const rows = buildLeaderboard({
    eligibleUserIds: [...eligibleUserIds, AI_PLAYER_ID],
    profiles: [
      ...(profiles.data ?? []).map((profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      })),
      {
        id: AI_PLAYER_ID,
        displayName: gameSettings.aiPlayerName,
        avatarUrl: gameSettings.aiPlayerAvatarUrl,
      },
    ],
    scores: [
      ...(scores.data ?? []).map((score) => ({
        userId: score.user_id,
        totalPoints: score.total_points,
        exactScore: score.exact_score,
        correctOutcome: score.correct_outcome,
      })),
      ...aiScores,
      ...provisionalScores,
    ],
    seasonPicks: [
      ...(seasonPicks.data ?? []).map((pick) => ({
        userId: pick.user_id,
        season: pick.season,
        championAwardedPoints: pick.champion_awarded_points,
        scorerAwardedPoints: pick.scorer_awarded_points,
        settledAt: pick.settled_at,
        championNameEn: pick.champion_name_en,
        championNameHe: pick.champion_name_he,
        championLogoUrl: pick.champion_logo_url,
        championPotentialPoints: requiredCandidatePoints(
          teamPickPoints,
          pick.season,
          pick.champion_name_en
        ),
        scorerNameEn: pick.scorer_name_en,
        scorerNameHe: pick.scorer_name_he,
        scorerPhotoUrl: pick.scorer_photo_url,
        scorerPotentialPoints: requiredCandidatePoints(
          playerPickPoints,
          pick.season,
          pick.scorer_name_en
        ),
      })),
      ...(aiSeasonPicks.data ?? []).map((pick) => ({
        userId: AI_PLAYER_ID,
        season: pick.season,
        championAwardedPoints: pick.champion_awarded_points,
        scorerAwardedPoints: pick.scorer_awarded_points,
        settledAt: pick.settled_at,
        championNameEn: pick.champion_name_en,
        championNameHe: pick.champion_name_he,
        championLogoUrl: pick.champion_logo_url,
        championPotentialPoints: requiredCandidatePoints(
          teamPickPoints,
          pick.season,
          pick.champion_name_en
        ),
        scorerNameEn: pick.scorer_name_en,
        scorerNameHe: pick.scorer_name_he,
        scorerPhotoUrl: pick.scorer_photo_url,
        scorerPotentialPoints: requiredCandidatePoints(
          playerPickPoints,
          pick.season,
          pick.scorer_name_en
        ),
      })),
    ],
    viewerUserId: userId,
    currentSeason,
    picksRevealed,
  });

  const selectedRow = rows.find((row) => row.userId === requestedPlayerId);
  let selectedPlayer: LeaderboardPlayerHistory | null = null;
  if (selectedRow) {
    const predictions =
      selectedRow.userId === AI_PLAYER_ID
        ? (aiPredictions.data ?? []).map((prediction) => ({
            fixture_id: prediction.fixture_id,
            home_goals: prediction.predicted_home_goals,
            away_goals: prediction.predicted_away_goals,
          }))
        : await loadPlayerPredictions(supabase, selectedRow.userId);
    const fixtureById = new Map(
      (startedFixtures.data ?? []).map((fixture) => [fixture.id, fixture])
    );
    const hebrewNameByTeamId = new Map(
      (teamTranslations.data ?? []).flatMap((team) =>
        team.team_id ? [[team.team_id, team.name_he] as const] : []
      )
    );
    const hebrewNameByEnglishKey = new Map(
      (teamTranslations.data ?? []).map((team) => [
        teamTranslationKey(team.name_en),
        team.name_he,
      ])
    );
    const teamById = new Map(
      (teams.data ?? []).map((team) => {
        const englishKeys = [team.name, team.short_name].map(teamTranslationKey);
        return [
          team.id,
          {
            nameEn: team.short_name,
            nameHe:
              hebrewNameByTeamId.get(team.id) ??
              englishKeys
                .map((key) => hebrewNameByEnglishKey.get(key))
                .find((name) => name !== undefined) ??
              team.short_name,
            logoUrl: team.logo_url,
          },
        ] as const;
      })
    );
    const humanScoreByFixture = new Map(
      (scores.data ?? [])
        .filter((score) => score.user_id === selectedRow.userId)
        .map((score) => [score.fixture_id, score.total_points])
    );
    const aiScoreByFixture = new Map(
      (aiPredictions.data ?? []).flatMap((prediction) => {
        const fixture = fixtureById.get(prediction.fixture_id);
        if (!fixture || fixture.home_goals === null || fixture.away_goals === null) {
          return [];
        }
        const score = buildAiScoreRows(
          [{
            fixtureId: fixture.id,
            homeGoals: fixture.home_goals,
            awayGoals: fixture.away_goals,
            settled: fixture.status === "finished",
            outcomePoints: {
              home: fixture.home_win_points,
              draw: fixture.draw_points,
              away: fixture.away_win_points,
            },
          }],
          [{
            fixtureId: prediction.fixture_id,
            homeGoals: prediction.predicted_home_goals,
            awayGoals: prediction.predicted_away_goals,
          }]
        )[0];
        return score ? [[prediction.fixture_id, score.totalPoints] as const] : [];
      })
    );
    const liveScoreByFixture = new Map(
      provisionalScores
        .filter((score) => score.userId === selectedRow.userId)
        .map((score) => [score.fixtureId, score.totalPoints])
    );

    selectedPlayer = {
      userId: selectedRow.userId,
      displayName: selectedRow.displayName,
      avatarUrl: selectedRow.avatarUrl,
      isAi: selectedRow.userId === AI_PLAYER_ID,
      predictions: predictions.flatMap((prediction) => {
        const fixture = fixtureById.get(prediction.fixture_id);
        if (!fixture) return [];
        return [{
          fixtureId: fixture.id,
          kickoffAt: fixture.kickoff_at,
          homeTeam: teamById.get(fixture.home_team_id) ?? {
            nameEn: "-",
            nameHe: "-",
            logoUrl: null,
          },
          awayTeam: teamById.get(fixture.away_team_id) ?? {
            nameEn: "-",
            nameHe: "-",
            logoUrl: null,
          },
          predictedHomeGoals: prediction.home_goals,
          predictedAwayGoals: prediction.away_goals,
          actualHomeGoals: fixture.home_goals,
          actualAwayGoals: fixture.away_goals,
          points:
            (selectedRow.userId === AI_PLAYER_ID
              ? aiScoreByFixture.get(fixture.id)
              : humanScoreByFixture.get(fixture.id)) ??
            liveScoreByFixture.get(fixture.id) ??
            null,
        }];
      }).sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt)),
    };
  }

  return {
    groups,
    selectedGroup,
    rows,
    currentSeason,
    picksRevealed,
    selectedPlayer,
  };
}

function seasonCandidateKey(season: number, name: string): string {
  return `${season}:${name}`;
}

function requiredCandidatePoints(
  pointsByCandidate: Map<string, number>,
  season: number,
  name: string
): number {
  const points = pointsByCandidate.get(seasonCandidateKey(season, name));
  if (points === undefined) {
    throw new Error(`Missing season-pick points for ${name} in ${season}`);
  }
  return points;
}

async function loadPlayerPredictions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string
) {
  const result = await supabase
    .from("predictions")
    .select("fixture_id, home_goals, away_goals")
    .eq("user_id", playerId);
  assertResult("predictions", result);
  return result.data ?? [];
}
