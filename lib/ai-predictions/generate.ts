import "server-only";

import {
  estimateOpenAiCostMicrousd,
  predictionReservationMicrousd,
} from "@/lib/ai-predictions/cost";
import { aiPredictionHorizonHours } from "@/lib/ai-predictions/horizon";
import { isMissingCacheWriteTokensColumn } from "@/lib/ai-predictions/usage-storage";
import {
  type MatchResult,
  type PredictionSource,
} from "@/lib/ai-predictions/model";
import {
  researchPredictions,
  type ResearchSource,
} from "@/lib/ai-predictions/research";
import { serverEnv } from "@/lib/env.server";
import type { FixtureRecord, Json, TeamRecord } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const REFRESH_AFTER_MS = 20 * 60 * 60_000;
const BATCH_SIZE = 1;
// A researched response can consume ~30K TPM. Sequential batches stay within
// the 60K TPM limit of a low-tier project; researchPredictions also retries a
// transient 429 using the server-provided delay.
const CONCURRENT_BATCHES = 1;

export type AiPredictionReport = {
  model: string;
  eligible: number;
  generated: number;
  skipped: number;
  budgetSkipped: number;
  budgetExhausted: boolean;
  budgetLimitUsd: number;
  estimatedCostUsd: number;
  failures: Array<{ fixtureId: string; error: string }>;
};

function recentResults(
  fixtures: FixtureRecord[],
  teams: Map<string, TeamRecord>,
  teamId: string,
  before: string
): MatchResult[] {
  return fixtures
    .filter(
      (fixture) =>
        fixture.kickoff_at < before &&
        fixture.home_goals !== null &&
        fixture.away_goals !== null &&
        (fixture.home_team_id === teamId || fixture.away_team_id === teamId)
    )
    .sort((left, right) => right.kickoff_at.localeCompare(left.kickoff_at))
    .slice(0, 5)
    .map((fixture) => ({
      date: fixture.kickoff_at.slice(0, 10),
      competition: "UEFA Champions League",
      homeTeam: teams.get(fixture.home_team_id)?.name ?? "Unknown",
      awayTeam: teams.get(fixture.away_team_id)?.name ?? "Unknown",
      score: `${fixture.home_goals}-${fixture.away_goals}`,
      venue: fixture.home_team_id === teamId ? "home" : "away",
    }));
}

function buildSource(
  fixture: FixtureRecord,
  fixtures: FixtureRecord[],
  teams: Map<string, TeamRecord>
): PredictionSource {
  return {
    competition: "UEFA Champions League",
    fixture: {
      kickoffAt: fixture.kickoff_at,
      stage: fixture.stage,
      round: fixture.round,
      venue: fixture.venue,
      homeTeam: teams.get(fixture.home_team_id)?.name ?? "Unknown",
      awayTeam: teams.get(fixture.away_team_id)?.name ?? "Unknown",
    },
    modelProbabilities: {
      home: fixture.prob_home,
      draw: fixture.prob_draw,
      away: fixture.prob_away,
    },
    recentResults: {
      homeTeam: recentResults(
        fixtures,
        teams,
        fixture.home_team_id,
        fixture.kickoff_at
      ),
      awayTeam: recentResults(
        fixtures,
        teams,
        fixture.away_team_id,
        fixture.kickoff_at
      ),
    },
  };
}

function batchesOf<T>(values: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

export async function generateDueAiPredictions(
  options: {
    horizonHours?: number | null;
    force?: boolean;
    fixtureId?: string;
    model?: string;
  } = {}
): Promise<AiPredictionReport> {
  const env = serverEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate AI predictions");
  }
  const model = options.model ?? env.OPENAI_MODEL;
  estimateOpenAiCostMicrousd(model, {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    webSearchCalls: 0,
  });

  const horizonHours = aiPredictionHorizonHours(options.horizonHours);
  const now = new Date();
  const db = createServiceRoleClient();

  const horizon = new Date(now.getTime() + horizonHours * 60 * 60_000);
  const dueQuery = db
    .from("fixtures")
    .select("*")
    .eq("status", "scheduled")
    .gt("kickoff_at", now.toISOString())
    .lte("kickoff_at", horizon.toISOString());
  if (options.fixtureId) dueQuery.eq("id", options.fixtureId);

  const [{ data: due, error: dueError }, { data: allFixtures, error: fixtureError }, { data: teams, error: teamError }] =
    await Promise.all([
      dueQuery.order("kickoff_at", { ascending: true }),
      db.from("fixtures").select("*").order("kickoff_at", { ascending: true }),
      db.from("teams").select("*"),
    ]);

  if (dueError) throw new Error(`Loading due fixtures failed: ${dueError.message}`);
  if (fixtureError) throw new Error(`Loading fixture history failed: ${fixtureError.message}`);
  if (teamError) throw new Error(`Loading teams failed: ${teamError.message}`);

  const dueFixtures = due ?? [];
  const report: AiPredictionReport = {
    model,
    eligible: dueFixtures.length,
    generated: 0,
    skipped: 0,
    budgetSkipped: 0,
    budgetExhausted: false,
    budgetLimitUsd: env.OPENAI_PREDICTION_BUDGET_USD,
    estimatedCostUsd: 0,
    failures: [],
  };
  if (dueFixtures.length === 0) return report;

  const dueIds = dueFixtures.map((fixture) => fixture.id);
  const { data: existing, error: existingError } = await db
    .from("ai_match_predictions")
    .select("fixture_id, generated_at")
    .in("fixture_id", dueIds);
  if (existingError) {
    throw new Error(`Loading existing AI predictions failed: ${existingError.message}`);
  }

  const refreshBefore = now.getTime() - REFRESH_AFTER_MS;
  const freshIds = new Set(
    (existing ?? [])
      .filter((row) => new Date(row.generated_at).getTime() > refreshBefore)
      .map((row) => row.fixture_id)
  );
  const teamMap = new Map((teams ?? []).map((team) => [team.id, team]));
  const targets = dueFixtures.filter((fixture) => {
    if (!options.force && freshIds.has(fixture.id)) {
      report.skipped += 1;
      return false;
    }
    return true;
  });
  const researchSources: ResearchSource[] = targets.map((fixture) => ({
    fixtureId: fixture.id,
    ...buildSource(fixture, allFixtures ?? [], teamMap),
  }));
  const sourceByFixture = new Map(
    researchSources.map((source) => [source.fixtureId, source])
  );
  const batches = batchesOf(researchSources, BATCH_SIZE);

  async function runWorker(workerIndex: number): Promise<void> {
    for (
      let batchIndex = workerIndex;
      batchIndex < batches.length;
      batchIndex += CONCURRENT_BATCHES
    ) {
      const batch = batches[batchIndex]!;
      let reservationId: string | null = null;
      let usageRecorded = false;
      try {
        const { data, error: reservationError } = await db.rpc(
          "reserve_ai_prediction_budget",
          {
            budget_microusd: Math.floor(
              env.OPENAI_PREDICTION_BUDGET_USD * 1_000_000
            ),
            charge_microusd: predictionReservationMicrousd(model),
            model_name: model,
            prediction_fixture_id: batch[0]!.fixtureId,
          }
        );
        if (reservationError) {
          throw new Error(`Reserving AI budget failed: ${reservationError.message}`);
        }
        reservationId = data;
        if (!reservationId) {
          report.budgetExhausted = true;
          report.budgetSkipped += batch.length;
          continue;
        }

        const result = await researchPredictions(
          batch,
          env.OPENAI_API_KEY!,
          model,
          now
        );
        const estimatedCostMicrousd = estimateOpenAiCostMicrousd(
          model,
          result.usage
        );
        const usageValues = {
          estimated_cost_microusd: estimatedCostMicrousd,
          input_tokens: result.usage.inputTokens,
          cached_input_tokens: result.usage.cachedInputTokens,
          cache_write_tokens: result.usage.cacheWriteTokens,
          output_tokens: result.usage.outputTokens,
          web_search_calls: result.usage.webSearchCalls,
          status: "completed" as const,
          completed_at: new Date().toISOString(),
        };
        let { error: usageError } = await db
          .from("ai_prediction_usage")
          .update(usageValues)
          .eq("id", reservationId);
        if (usageError && isMissingCacheWriteTokensColumn(usageError)) {
          const { cache_write_tokens: _pendingMigrationValue, ...legacyValues } =
            usageValues;
          void _pendingMigrationValue;
          const legacyResult = await db
            .from("ai_prediction_usage")
            .update(legacyValues)
            .eq("id", reservationId);
          usageError = legacyResult.error;
        }
        if (usageError) {
          throw new Error(`Saving AI usage failed: ${usageError.message}`);
        }
        usageRecorded = true;
        report.estimatedCostUsd += estimatedCostMicrousd / 1_000_000;

        const generatedAt = new Date().toISOString();
        const rows = result.predictions.map((prediction) => ({
          fixture_id: prediction.fixtureId,
          predicted_home_goals: prediction.predictedHomeGoals,
          predicted_away_goals: prediction.predictedAwayGoals,
          home_win_probability: prediction.homeWinProbability,
          draw_probability: prediction.drawProbability,
          away_win_probability: prediction.awayWinProbability,
          confidence: prediction.confidence,
          summary_en: prediction.summaryEn,
          summary_he: prediction.summaryHe,
          key_factors_en: prediction.keyFactorsEn,
          key_factors_he: prediction.keyFactorsHe,
          sources: prediction.sources,
          model,
          source_snapshot: sourceByFixture.get(
            prediction.fixtureId
          ) as unknown as Json,
          generated_at: generatedAt,
        }));
        const { error } = await db.from("ai_match_predictions").upsert(rows);
        if (error) throw new Error(`Saving predictions failed: ${error.message}`);
        report.generated += result.predictions.length;
      } catch (error) {
        let message = error instanceof Error ? error.message : String(error);
        // A failed provider call did not spend the conservative reservation.
        // Once measured usage was recorded, keep it even if the later cache
        // write fails because the OpenAI cost was genuinely incurred.
        if (reservationId && !usageRecorded) {
          const { error: releaseError } = await db
            .from("ai_prediction_usage")
            .delete()
            .eq("id", reservationId);
          if (releaseError) {
            message += `; releasing AI budget failed: ${releaseError.message}`;
          }
        }
        for (const source of batch) {
          report.failures.push({ fixtureId: source.fixtureId, error: message });
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENT_BATCHES, batches.length) },
      (_, workerIndex) => runWorker(workerIndex)
    )
  );

  return report;
}
