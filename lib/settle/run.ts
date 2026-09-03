import "server-only";

import { serverEnv } from "@/lib/env.server";
import { normaliseScale } from "@/lib/fixtures/rebase";
import { scorePrediction } from "@/lib/scoring/engine";
import { seasonPickAward } from "@/lib/season-picks/outcomes";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Settlement.
 *
 * Releases withheld results into public.fixtures once a match has finished,
 * then scores every prediction against them with the same pure
 * `scorePrediction()` the UI uses for its live projection — so the number a
 * user was shown and the number they are awarded cannot diverge.
 *
 * Idempotent. `fixture_results.released_at` marks work already done, so a cron
 * that fires twice, or a manual re-run, settles nothing a second time.
 *
 * This is the code path that does NOT change when the app moves to a live
 * 2026/27 subscription. Only the source of the `fixture_results` rows differs:
 * ingest writes them from a finished season today, a live-score poll writes
 * them as matches end later.
 */

/** 90 minutes plus stoppage and the half-time interval. */
const MATCH_DURATION_MINUTES = 105;

export type SettleReport = {
  dryRun: boolean;
  /** Results eligible for release at this moment. */
  due: number;
  fixturesReleased: number;
  predictionsScored: number;
  pointsAwarded: number;
  seasonPicksSettled: number;
  seasonPickPointsAwarded: number;
  /** How long a match is treated as lasting, after time compression. */
  effectiveMatchMinutes: number;
};

/**
 * A replayed season runs on compressed time, so the match itself has to
 * compress with it. At scale 0.04 consecutive fixtures are 4% of their real
 * distance apart, and a match still "lasting" a full 105 minutes would run
 * straight through the ones that follow it.
 */
function effectiveMatchMinutes(): number {
  const env = serverEnv();
  if (!env.REBASE_ENABLED) return MATCH_DURATION_MINUTES;
  return MATCH_DURATION_MINUTES * normaliseScale(env.REBASE_SCALE);
}

export async function settleDueFixtures(
  options: { dryRun?: boolean } = {}
): Promise<SettleReport> {
  const dryRun = options.dryRun ?? false;
  const db = createServiceRoleClient();

  const matchMinutes = effectiveMatchMinutes();
  const finishedBefore = new Date(Date.now() - matchMinutes * 60_000);

  const report: SettleReport = {
    dryRun,
    due: 0,
    fixturesReleased: 0,
    predictionsScored: 0,
    pointsAwarded: 0,
    seasonPicksSettled: 0,
    seasonPickPointsAwarded: 0,
    effectiveMatchMinutes: matchMinutes,
  };

  /* ---------------------------------------------------------- find work -- */

  // Fixtures that kicked off long enough ago to have finished.
  const { data: startedFixtures, error: fixtureError } = await db
    .from("fixtures")
    .select("id, home_win_points, draw_points, away_win_points")
    .lte("kickoff_at", finishedBefore.toISOString());

  if (fixtureError) {
    throw new Error(`Finding started fixtures failed: ${fixtureError.message}`);
  }

  if (!startedFixtures || startedFixtures.length === 0) {
    await settleSeasonPicks(db, finishedBefore, report, dryRun);
    return report;
  }

  const startedIds = startedFixtures.map((f) => f.id);

  const { data: pending, error: pendingError } = await db
    .from("fixture_results")
    .select("*")
    .is("released_at", null)
    .in("fixture_id", startedIds);

  if (pendingError) {
    throw new Error(`Finding pending results failed: ${pendingError.message}`);
  }

  if (!pending || pending.length === 0) {
    await settleSeasonPicks(db, finishedBefore, report, dryRun);
    return report;
  }
  report.due = pending.length;

  if (dryRun) {
    await settleSeasonPicks(db, finishedBefore, report, true);
    return report;
  }

  const started = new Map(startedFixtures.map((f) => [f.id, f]));

  /* ------------------------------------------------------------- settle -- */

  for (const result of pending) {
    const fixture = started.get(result.fixture_id);
    if (!fixture) continue;

    // Release the result. This is the moment it becomes visible to users.
    const { error: releaseError } = await db
      .from("fixtures")
      .update({
        status: result.status,
        home_goals: result.home_goals,
        away_goals: result.away_goals,
        went_to_extra_time: result.went_to_extra_time,
        elapsed_minutes: result.elapsed_minutes,
      })
      .eq("id", result.fixture_id);

    if (releaseError) {
      throw new Error(
        `Releasing fixture ${result.fixture_id} failed: ${releaseError.message}`
      );
    }
    report.fixturesReleased += 1;

    // A postponed or abandoned match has no score to settle against.
    if (result.home_goals === null || result.away_goals === null) {
      await markReleased(db, result.fixture_id);
      continue;
    }

    const { data: predictions, error: predictionError } = await db
      .from("predictions")
      .select("id, user_id, fixture_id, home_goals, away_goals")
      .eq("fixture_id", result.fixture_id);

    if (predictionError) {
      throw new Error(`Loading predictions failed: ${predictionError.message}`);
    }

    const scored = (predictions ?? []).map((row) => {
      const breakdown = scorePrediction(
        { homeGoals: row.home_goals, awayGoals: row.away_goals },
        { homeGoals: result.home_goals!, awayGoals: result.away_goals! },
        {
          home: fixture.home_win_points,
          draw: fixture.draw_points,
          away: fixture.away_win_points,
        }
      );

      return {
        prediction_id: row.id,
        user_id: row.user_id,
        fixture_id: row.fixture_id,
        // Base and total are the same number. The three multiplier columns
        // predate the current model; they are held at 1 rather than
        // dropped so an already-applied 0001_init.sql keeps working, and
        // nothing reads them any more.
        base_points: breakdown.totalPoints,
        correct_outcome: breakdown.correctOutcome,
        correct_goal_difference: breakdown.correctGoalDifference,
        exact_score: breakdown.exactScore,
        difficulty_multiplier: 1,
        stage_multiplier: 1,
        joker_multiplier: 1,
        total_points: breakdown.totalPoints,
        breakdown: breakdown.lines,
      };
    });

    if (scored.length > 0) {
      const { error: scoreError } = await db
        .from("prediction_scores")
        .upsert(scored, { onConflict: "prediction_id" });

      if (scoreError) {
        throw new Error(`Writing scores failed: ${scoreError.message}`);
      }

      report.predictionsScored += scored.length;
      report.pointsAwarded += scored.reduce((sum, s) => sum + s.total_points, 0);
    }

    // Last, so a crash mid-scoring leaves the fixture pending and the next run
    // picks it up. Upserting scores by prediction_id makes the retry safe.
    await markReleased(db, result.fixture_id);
  }

  await settleSeasonPicks(db, finishedBefore, report, false);
  return report;
}

async function settleSeasonPicks(
  db: ReturnType<typeof createServiceRoleClient>,
  finishedBefore: Date,
  report: SettleReport,
  dryRun: boolean
): Promise<void> {
  const { data: outcomes, error: outcomeError } = await db
    .from("season_outcomes")
    .select("season, champion_team_id, top_scorer_football_data_ids, released_at");

  if (outcomeError) {
    throw new Error(`Loading season outcomes failed: ${outcomeError.message}`);
  }

  for (const outcome of outcomes ?? []) {
    // The hidden historical outcome is prepared during ingest, but it may not
    // affect the game until the replayed final has actually completed.
    const { data: final, error: finalError } = await db
      .from("fixtures")
      .select("id")
      .eq("season", outcome.season)
      .eq("stage", "final")
      .eq("status", "finished")
      .lte("kickoff_at", finishedBefore.toISOString())
      .limit(1)
      .maybeSingle();

    if (finalError) {
      throw new Error(`Checking season final failed: ${finalError.message}`);
    }
    if (!final) continue;

    const { data: picks, error: picksError } = await db
      .from("season_picks")
      .select(
        "id, champion_candidate_id, top_scorer_candidate_id, champion_pick_points, scorer_pick_points"
      )
      .eq("season", outcome.season)
      .is("settled_at", null);

    if (picksError) {
      throw new Error(`Loading season picks failed: ${picksError.message}`);
    }

    const candidateIds = [...new Set((picks ?? []).map((pick) => pick.top_scorer_candidate_id))];
    const championCandidateIds = [...new Set((picks ?? []).map((pick) => pick.champion_candidate_id))];
    const [{ data: candidates, error: candidateError }, { data: teamCandidates, error: teamCandidateError }] = await Promise.all([
      db
      .from("season_player_candidates")
      .select("candidate_id, football_data_id")
      .eq("season", outcome.season)
      .in("candidate_id", candidateIds),
      db
        .from("season_team_candidates")
        .select("candidate_id, team_id")
        .eq("season", outcome.season)
        .in("candidate_id", championCandidateIds),
    ]);
    if (candidateError || teamCandidateError) {
      throw new Error(
        `Loading season candidates failed: ${candidateError?.message ?? teamCandidateError?.message}`
      );
    }
    const providerIdByCandidate = new Map(
      (candidates ?? []).map((candidate) => [
        candidate.candidate_id,
        candidate.football_data_id,
      ])
    );
    const teamIdByCandidate = new Map(
      (teamCandidates ?? []).map((candidate) => [
        candidate.candidate_id,
        candidate.team_id,
      ])
    );

    const awards = (picks ?? []).map((pick) => {
      const award = seasonPickAward(
        {
          championTeamId:
            teamIdByCandidate.get(pick.champion_candidate_id) ?? null,
          topScorerFootballDataId:
            providerIdByCandidate.get(pick.top_scorer_candidate_id) ?? null,
          championPickPoints: pick.champion_pick_points,
          scorerPickPoints: pick.scorer_pick_points,
        },
        {
          championTeamId: outcome.champion_team_id,
          topScorerFootballDataIds: outcome.top_scorer_football_data_ids,
        }
      );

      return {
        id: pick.id,
        ...award,
      };
    });

    report.seasonPicksSettled += awards.length;
    report.seasonPickPointsAwarded += awards.reduce(
      (sum, award) => sum + award.championPoints + award.scorerPoints,
      0
    );

    if (dryRun) continue;

    const settledAt = new Date().toISOString();
    for (const award of awards) {
      const { error } = await db
        .from("season_picks")
        .update({
          champion_awarded_points: award.championPoints,
          scorer_awarded_points: award.scorerPoints,
          settled_at: settledAt,
        })
        .eq("id", award.id)
        .is("settled_at", null);

      if (error) {
        throw new Error(`Settling season pick ${award.id} failed: ${error.message}`);
      }
    }

    if (!outcome.released_at) {
      const { error } = await db
        .from("season_outcomes")
        .update({ released_at: settledAt })
        .eq("season", outcome.season)
        .is("released_at", null);

      if (error) {
        throw new Error(`Releasing season outcome failed: ${error.message}`);
      }
    }
  }
}

async function markReleased(
  db: ReturnType<typeof createServiceRoleClient>,
  fixtureId: string
): Promise<void> {
  const { error } = await db
    .from("fixture_results")
    .update({ released_at: new Date().toISOString() })
    .eq("fixture_id", fixtureId);

  if (error) {
    throw new Error(`Marking ${fixtureId} released failed: ${error.message}`);
  }
}
