import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import {
  normalizePersonName,
  teamTranslationKey,
  type PlayerNameTranslations,
} from "@/lib/fixtures/localization";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  initialHomeRoundItems,
  nextRoundItems,
  type FixtureRoundSelection,
} from "@/lib/fixtures/schedule";
import type {
  AiPrediction,
  Fixture,
  Prediction,
  Team,
} from "@/lib/fixtures/types";
import type {
  FixtureRecord,
  TeamRecord,
} from "@/lib/supabase/database.types";
import { ensureAutomaticPredictions } from "@/lib/predictions/automatic-fallback.server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Reading fixtures back out as domain objects.
 *
 * Teams are fetched separately and joined in memory rather than through a
 * PostgREST embed. The competition is 36 clubs, so the second round trip is
 * trivial, and it keeps this layer independent of the `Relationships` metadata
 * that the hand-written `database.types.ts` placeholder does not carry.
 *
 * Public catalogue data is read with the server-only client so it can be
 * shared safely across visitors. User predictions still run under the
 * caller's RLS context and are never placed in the shared cache.
 */

/**
 * Raised when the tables do not exist yet — i.e. the migrations have not been
 * applied to this Supabase project.
 *
 * Distinguished from an empty table on purpose: "no rows" means the season has
 * not been ingested, "no table" means setup is incomplete, and the two need
 * different instructions. Without this the home page throws a raw 500 during
 * first-time setup, which reads as a broken app rather than a missing step.
 */
export class SchemaNotReadyError extends Error {
  constructor(readonly table: string) {
    super(`Table public.${table} does not exist — apply the migrations.`);
    this.name = "SchemaNotReadyError";
  }
}

type PostgrestFailure = { code?: string; message: string };

/** PGRST205 is PostgREST's "relation not found in the schema cache". */
function isMissingTable(error: PostgrestFailure): boolean {
  return (
    error.code === "PGRST205" ||
    /Could not find the table/i.test(error.message)
  );
}

/** Rethrows as SchemaNotReadyError when the cause is a missing table. */
function fail(table: string, action: string, error: PostgrestFailure): never {
  if (isMissingTable(error)) throw new SchemaNotReadyError(table);
  throw new Error(`${action} failed: ${error.message}`);
}

function toTeam(
  record: TeamRecord,
  localizedName?: string,
  marketProbability?: number | null
): Team {
  return {
    id: record.id,
    name: localizedName ?? record.name,
    shortName: localizedName ?? record.short_name,
    code: record.code,
    color: record.color,
    logoUrl: record.logo_url,
    marketProbability: marketProbability ?? null,
  };
}

function toFixture(record: FixtureRecord, teams: Map<string, Team>): Fixture | null {
  const homeTeam = teams.get(record.home_team_id);
  const awayTeam = teams.get(record.away_team_id);

  // A fixture whose clubs are missing cannot be rendered. Skipping beats
  // throwing: one bad row should not blank the whole matchday.
  if (!homeTeam || !awayTeam) return null;

  return {
    id: record.id,
    footballDataId: record.football_data_id ?? undefined,
    season: record.season,
    stage: record.stage,
    round: record.round,
    kickoffAt: record.kickoff_at,
    venue: record.venue,
    venueDetails: {
      city: record.venue_city ?? null,
      address: record.venue_address ?? null,
      capacity: record.venue_capacity ?? null,
      surface: record.venue_surface ?? null,
      imageUrl: record.venue_image_url ?? null,
    },
    referee: record.referee ?? null,
    attendance: record.attendance ?? null,
    homeTeam,
    awayTeam,
    status: record.status,
    homeGoals: record.home_goals,
    awayGoals: record.away_goals,
    elapsedMinutes: record.elapsed_minutes,
    wentToExtraTime: record.went_to_extra_time,
    forecast: {
      home: record.prob_home,
      draw: record.prob_draw,
      away: record.prob_away,
    },
    outcomePoints: {
      home: record.home_win_points,
      draw: record.draw_points,
      away: record.away_win_points,
    },
  };
}

async function loadTeams(
  season: number,
  locale: string
): Promise<Map<string, Team>> {
  const teams = await loadLocalizedTeams(season, locale);
  return new Map(teams.map((team) => [team.id, team]));
}

async function loadLocalizedTeams(
  season: number,
  locale: string
): Promise<Team[]> {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(CACHE_TAGS.teams);

  const supabase = createServiceRoleClient();
  const teamsRequest = supabase.from("teams").select("*");

  // Candidate catalogues are intentionally not exposed to signed-out users.
  // Read the public-facing name and market probability fields on the server,
  // then pass plain values to the rendered client components.
  const translationsRequest = supabase
    .from("season_team_candidates")
    .select("team_id, name_en, name_he, implied_probability")
    .eq("season", season);
  const [teamsResult, translationsResult] = await Promise.all([
    teamsRequest,
    translationsRequest,
  ]);

  if (teamsResult.error) fail("teams", "Loading teams", teamsResult.error);
  if (translationsResult.error) {
    fail(
      "season_team_candidates",
      "Loading Hebrew team names",
      translationsResult.error
    );
  }

  const nameByTeamId = new Map<string, string>();
  const nameByEnglishKey = new Map<string, string>();
  const probabilityByTeamId = new Map<string, number>();
  const probabilityByEnglishKey = new Map<string, number>();
  for (const translation of translationsResult.data ?? []) {
    if (translation.team_id) {
      nameByTeamId.set(translation.team_id, translation.name_he);
      probabilityByTeamId.set(
        translation.team_id,
        translation.implied_probability
      );
    }
    const englishKey = teamTranslationKey(translation.name_en);
    nameByEnglishKey.set(englishKey, translation.name_he);
    probabilityByEnglishKey.set(englishKey, translation.implied_probability);
  }

  return (teamsResult.data ?? []).map((team) => {
      const englishKeys = [team.name, team.short_name].map(teamTranslationKey);
      const localizedName = locale === "he"
        ? nameByTeamId.get(team.id) ??
          englishKeys.map((key) => nameByEnglishKey.get(key)).find(Boolean)
        : undefined;
      const marketProbability =
        probabilityByTeamId.get(team.id) ??
        englishKeys
          .map((key) => probabilityByEnglishKey.get(key))
          .find((value) => value !== undefined) ??
        null;

      return toTeam(team, localizedName, marketProbability);
    });
}

async function getLatestSeason(): Promise<number | null> {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(CACHE_TAGS.fixtures);

  const { data, error } = await createServiceRoleClient()
    .from("fixtures")
    .select("season")
    .order("season", { ascending: false })
    .limit(1);

  if (error) fail("fixtures", "Finding the latest season", error);
  return data?.[0]?.season ?? null;
}

async function loadSeasonFixtureRecords(
  season: number
): Promise<FixtureRecord[]> {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(CACHE_TAGS.fixtures);

  const { data, error } = await createServiceRoleClient()
    .from("fixtures")
    .select("*")
    .eq("season", season)
    .order("kickoff_at", { ascending: true });

  if (error) fail("fixtures", "Loading fixtures", error);
  return data ?? [];
}

/** One public fixture for the match-detail route. */
export async function getFixtureById(
  id: string,
  locale: string
): Promise<Fixture | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fixtures")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) fail("fixtures", "Loading fixture", error);
  if (!data) return null;

  const teams = await loadTeams(data.season, locale);
  return toFixture(data, teams);
}

/** Every fixture in the latest season, oldest first. Used by standings/history. */
export async function getAllFixtures(locale: string): Promise<Fixture[]> {
  const season = await getLatestSeason();
  if (season === null) return [];

  const [teams, data] = await Promise.all([
    loadTeams(season, locale),
    loadSeasonFixtureRecords(season),
  ]);

  return data
    .map((record) => toFixture(record, teams))
    .filter((f) => f !== null);
}

export async function getInitialHomeFixtureWindow(
  locale: string,
  nowMs: number
) {
  const allFixtures = await getAllFixtures(locale);
  const initial = initialHomeRoundItems(allFixtures, nowMs);
  return {
    fixtures: initial.items,
    remainingRoundCount: initial.remainingRoundCount,
    availableStages: [...new Set(allFixtures.map((fixture) => fixture.stage))],
  };
}

export async function getHomeFixtureRoundAfter(
  locale: string,
  cursor: FixtureRoundSelection
) {
  const allFixtures = await getAllFixtures(locale);
  return nextRoundItems(allFixtures, cursor);
}

/** Hebrew player names keyed both by provider id and normalized English name. */
export async function getHebrewPlayerNames(
  season: number
): Promise<PlayerNameTranslations> {
  const { data, error } = await createServiceRoleClient()
    .from("season_player_candidates")
    .select("football_data_id, name_en, name_he")
    .eq("season", season);

  if (error) {
    fail(
      "season_player_candidates",
      "Loading Hebrew player names",
      error
    );
  }

  const byProviderId: Record<string, string> = {};
  const byNormalizedName: Record<string, string> = {};
  for (const player of data ?? []) {
    if (player.football_data_id !== null) {
      byProviderId[String(player.football_data_id)] = player.name_he;
    }
    byNormalizedName[normalizePersonName(player.name_en)] = player.name_he;
  }

  return { byProviderId, byNormalizedName };
}

/**
 * The signed-in user's predictions, keyed by fixture id.
 *
 * RLS decides what comes back: the user's own rows always, plus anyone else's
 * whose fixture has kicked off. This selects by user anyway, so the blind rule
 * is enforced twice over.
 */
export async function getMyPredictions(
  userId: string
): Promise<Record<string, Prediction>> {
  await ensureAutomaticPredictions();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("predictions")
    .select("fixture_id, home_goals, away_goals")
    .eq("user_id", userId);

  if (error) fail("predictions", "Loading predictions", error);

  const byFixture: Record<string, Prediction> = {};
  for (const row of data ?? []) {
    byFixture[row.fixture_id] = {
      fixtureId: row.fixture_id,
      homeGoals: row.home_goals,
      awayGoals: row.away_goals,
    };
  }

  return byFixture;
}

/** Public cached AI analyses, localized and keyed by fixture id. */
export async function getAiPredictions(
  fixtureIds: string[],
  locale: string
): Promise<Record<string, AiPrediction>> {
  if (fixtureIds.length === 0) return {};

  const allPredictions = await getCachedAiPredictions(locale);
  const requested = new Set(fixtureIds);
  return Object.fromEntries(
    Object.entries(allPredictions).filter(([fixtureId]) => requested.has(fixtureId))
  );
}

async function getCachedAiPredictions(
  locale: string
): Promise<Record<string, AiPrediction>> {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(CACHE_TAGS.aiPredictions);

  const { data, error } = await createServiceRoleClient()
    .from("ai_match_predictions")
    .select("*");

  if (error) fail("ai_match_predictions", "Loading AI predictions", error);

  const byFixture: Record<string, AiPrediction> = {};
  for (const row of data ?? []) {
    const factors = locale === "he" ? row.key_factors_he : row.key_factors_en;
    const sources = Array.isArray(row.sources)
      ? row.sources.flatMap((source) => {
          if (
            typeof source !== "object" ||
            source === null ||
            Array.isArray(source) ||
            typeof source.title !== "string" ||
            typeof source.url !== "string"
          ) return [];
          try {
            const url = new URL(source.url);
            if (url.protocol !== "https:" && url.protocol !== "http:") return [];
            return [{ title: source.title, url: url.toString() }];
          } catch {
            return [];
          }
        })
      : [];
    byFixture[row.fixture_id] = {
      fixtureId: row.fixture_id,
      model: row.model,
      predictedHomeGoals: row.predicted_home_goals,
      predictedAwayGoals: row.predicted_away_goals,
      homeWinProbability: row.home_win_probability,
      drawProbability: row.draw_probability,
      awayWinProbability: row.away_win_probability,
      confidence: row.confidence,
      summary: locale === "he" ? row.summary_he : row.summary_en,
      keyFactors: Array.isArray(factors)
        ? factors.filter((factor): factor is string => typeof factor === "string")
        : [],
      sources,
      generatedAt: row.generated_at,
    };
  }

  return byFixture;
}

export type SettledScore = {
  fixtureId: string;
  totalPoints: number;
  exactScore: boolean;
  correctOutcome: boolean;
};

/** Settled points for the user, keyed by fixture id. */
export async function getMyScores(
  userId: string
): Promise<Record<string, SettledScore>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("prediction_scores")
    // One string literal, not a concatenation: supabase-js infers the row type
    // from the select text, and joining it defeats that inference.
    .select("fixture_id, total_points, exact_score, correct_outcome")
    .eq("user_id", userId);

  if (error) fail("prediction_scores", "Loading scores", error);

  const byFixture: Record<string, SettledScore> = {};
  for (const row of data ?? []) {
    byFixture[row.fixture_id] = {
      fixtureId: row.fixture_id,
      totalPoints: row.total_points,
      exactScore: row.exact_score,
      correctOutcome: row.correct_outcome,
    };
  }

  return byFixture;
}
