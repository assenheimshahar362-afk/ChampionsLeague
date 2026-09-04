import "server-only";

import { z } from "zod";

import { serverEnv } from "@/lib/env.server";
import type { FixtureRecentForm, RecentMatch } from "@/lib/fixtures/recent-form";
import { getFixtureRecentForm } from "@/lib/fixtures/recent-form.server";
import type { FixtureRecord, Json, TeamRecord } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const predictionSchema = z
  .object({
    predictedHomeGoals: z.number().int().min(0).max(6),
    predictedAwayGoals: z.number().int().min(0).max(6),
    homeWinProbability: z.number().int().min(0).max(100),
    drawProbability: z.number().int().min(0).max(100),
    awayWinProbability: z.number().int().min(0).max(100),
    confidence: z.number().int().min(0).max(100),
    summaryEn: z.string().trim().min(1).max(500),
    summaryHe: z.string().trim().min(1).max(500),
    keyFactorsEn: z.array(z.string().trim().min(1).max(140)).length(3),
    keyFactorsHe: z.array(z.string().trim().min(1).max(140)).length(3),
  })
  .refine(
    (value) =>
      value.homeWinProbability +
        value.drawProbability +
        value.awayWinProbability ===
      100,
    { message: "Probabilities must total 100" }
  );

type GeneratedPrediction = z.infer<typeof predictionSchema>;

type MatchResult = {
  date: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  venue: "home" | "away";
};

type PredictionSource = {
  competition: string;
  fixture: {
    kickoffAt: string;
    stage: string;
    round: string;
    venue: string | null;
    homeTeam: string;
    awayTeam: string;
  };
  modelProbabilities: {
    home: number | null;
    draw: number | null;
    away: number | null;
  };
  recentResults: {
    homeTeam: MatchResult[];
    awayTeam: MatchResult[];
  };
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

export type AiPredictionReport = {
  eligible: number;
  generated: number;
  skipped: number;
  failures: Array<{ fixtureId: string; error: string }>;
};

const responseJsonSchema = {
  type: "object",
  properties: {
    predictedHomeGoals: { type: "integer", minimum: 0, maximum: 6 },
    predictedAwayGoals: { type: "integer", minimum: 0, maximum: 6 },
    homeWinProbability: { type: "integer", minimum: 0, maximum: 100 },
    drawProbability: { type: "integer", minimum: 0, maximum: 100 },
    awayWinProbability: { type: "integer", minimum: 0, maximum: 100 },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    summaryEn: { type: "string", maxLength: 500 },
    summaryHe: { type: "string", maxLength: 500 },
    keyFactorsEn: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: 140 },
    },
    keyFactorsHe: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: 140 },
    },
  },
  required: [
    "predictedHomeGoals",
    "predictedAwayGoals",
    "homeWinProbability",
    "drawProbability",
    "awayWinProbability",
    "confidence",
    "summaryEn",
    "summaryHe",
    "keyFactorsEn",
    "keyFactorsHe",
  ],
  additionalProperties: false,
} as const;

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

function providerRecentResults(
  matches: RecentMatch[],
  teamProviderId: number
): MatchResult[] {
  return matches.map((match) => ({
    date: match.kickoffAt.slice(0, 10),
    competition: match.competition,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    score: `${match.homeGoals}-${match.awayGoals}`,
    venue: match.homeTeamId === teamProviderId ? "home" : "away",
  }));
}

function buildSource(
  fixture: FixtureRecord,
  fixtures: FixtureRecord[],
  teams: Map<string, TeamRecord>,
  providerForm: FixtureRecentForm | null
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
      homeTeam: providerForm
        ? providerRecentResults(
            providerForm.homeMatches,
            providerForm.homeTeamProviderId
          )
        : recentResults(fixtures, teams, fixture.home_team_id, fixture.kickoff_at),
      awayTeam: providerForm
        ? providerRecentResults(
            providerForm.awayMatches,
            providerForm.awayTeamProviderId
          )
        : recentResults(fixtures, teams, fixture.away_team_id, fixture.kickoff_at),
    },
  };
}

function outputText(response: OpenAiResponse): string {
  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error(response.error?.message ?? "OpenAI returned no structured output");
}

async function generatePrediction(
  source: PredictionSource,
  apiKey: string,
  model: string
): Promise<GeneratedPrediction> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You are a careful football match analyst. Use only the supplied data. " +
        "Never invent injuries, players, lineups, statistics, or news. Treat model probabilities as a prior, " +
        "not betting odds. Write concise, natural English and Hebrew. State uncertainty when data is sparse. " +
        "This is an entertainment prediction, not betting advice. Probabilities must add up to exactly 100.",
      input: JSON.stringify(source),
      text: {
        format: {
          type: "json_schema",
          name: "football_match_prediction",
          strict: true,
          schema: responseJsonSchema,
        },
      },
    }),
  });

  const payload = (await response.json()) as OpenAiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenAI request failed (${response.status})`);
  }

  return predictionSchema.parse(JSON.parse(outputText(payload)));
}

export async function generateDueAiPredictions(
  options: { horizonHours?: number; force?: boolean } = {}
): Promise<AiPredictionReport> {
  const env = serverEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate AI predictions");
  }

  const horizonHours = options.horizonHours ?? 24;
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonHours * 60 * 60_000);
  const db = createServiceRoleClient();

  const [{ data: due, error: dueError }, { data: allFixtures, error: fixtureError }, { data: teams, error: teamError }] =
    await Promise.all([
      db
        .from("fixtures")
        .select("*")
        .eq("status", "scheduled")
        .gt("kickoff_at", now.toISOString())
        .lte("kickoff_at", horizon.toISOString())
        .order("kickoff_at", { ascending: true }),
      db.from("fixtures").select("*").order("kickoff_at", { ascending: true }),
      db.from("teams").select("*"),
    ]);

  if (dueError) throw new Error(`Loading due fixtures failed: ${dueError.message}`);
  if (fixtureError) throw new Error(`Loading fixture history failed: ${fixtureError.message}`);
  if (teamError) throw new Error(`Loading teams failed: ${teamError.message}`);

  const dueFixtures = due ?? [];
  const report: AiPredictionReport = {
    eligible: dueFixtures.length,
    generated: 0,
    skipped: 0,
    failures: [],
  };
  if (dueFixtures.length === 0) return report;

  const dueIds = dueFixtures.map((fixture) => fixture.id);
  const { data: existing, error: existingError } = await db
    .from("ai_match_predictions")
    .select("fixture_id")
    .in("fixture_id", dueIds);
  if (existingError) {
    throw new Error(`Loading existing AI predictions failed: ${existingError.message}`);
  }

  const existingIds = new Set((existing ?? []).map((row) => row.fixture_id));
  const teamMap = new Map((teams ?? []).map((team) => [team.id, team]));

  for (const fixture of dueFixtures) {
    if (!options.force && existingIds.has(fixture.id)) {
      report.skipped += 1;
      continue;
    }

    try {
      const providerForm = await getFixtureRecentForm(fixture.id);
      const source = buildSource(
        fixture,
        allFixtures ?? [],
        teamMap,
        providerForm
      );
      const prediction = await generatePrediction(
        source,
        env.OPENAI_API_KEY,
        env.OPENAI_MODEL
      );
      const { error } = await db.from("ai_match_predictions").upsert({
        fixture_id: fixture.id,
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
        model: env.OPENAI_MODEL,
        source_snapshot: source as unknown as Json,
        generated_at: new Date().toISOString(),
      });
      if (error) throw new Error(`Saving prediction failed: ${error.message}`);
      report.generated += 1;
    } catch (error) {
      report.failures.push({
        fixtureId: fixture.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}