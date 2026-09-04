import "server-only";

import { connection } from "next/server";

import { footballDataGet } from "@/lib/football-data/client";
import type { WireMatch, WireMatchesResponse } from "@/lib/football-data/types";
import {
  projectedLineupFromMatch,
  type FixtureProjectedLineups,
  type ProjectedLineup,
} from "@/lib/fixtures/projected-lineup";
import {
  recentMatchesFromResponse,
  type FixtureRecentForm,
  type RecentMatch,
} from "@/lib/fixtures/recent-form";
import type { Json } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const CACHE_TTL_MS = 6 * 60 * 60_000;

type CachedRow = {
  fixture_id: string;
  home_matches: Json;
  away_matches: Json;
  home_lineup: Json | null;
  away_lineup: Json | null;
  fetched_at: string;
};

type RecentFormSnapshot = {
  form: FixtureRecentForm;
  lineups: FixtureProjectedLineups | null;
};

function isMissingTable(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /Could not find the table/i.test(error.message)
  );
}

function fromCachedRow(
  row: CachedRow,
  homeTeamProviderId: number,
  awayTeamProviderId: number
): FixtureRecentForm {
  return {
    fixtureId: row.fixture_id,
    homeTeamProviderId,
    awayTeamProviderId,
    homeMatches: row.home_matches as unknown as RecentMatch[],
    awayMatches: row.away_matches as unknown as RecentMatch[],
    fetchedAt: row.fetched_at,
  };
}

function includesTeamCrests(form: FixtureRecentForm): boolean {
  return [...form.homeMatches, ...form.awayMatches].every(
    (match) => "homeTeamCrest" in match && "awayTeamCrest" in match
  );
}

function cachedProjectedLineups(row: CachedRow): FixtureProjectedLineups | null {
  if (
    !hasCurrentProjectedLineupShape(row.home_lineup) ||
    !hasCurrentProjectedLineupShape(row.away_lineup)
  ) return null;
  return {
    home: row.home_lineup as unknown as ProjectedLineup,
    away: row.away_lineup as unknown as ProjectedLineup,
  };
}

async function loadFixtureRecentSnapshot(
  fixtureId: string
): Promise<RecentFormSnapshot | null> {
  await connection();
  const db = createServiceRoleClient();
  const { data: fixture, error: fixtureError } = await db
    .from("fixtures")
    .select("id, original_kickoff_at, home_team_id, away_team_id")
    .eq("id", fixtureId)
    .maybeSingle();

  if (fixtureError) {
    throw new Error(`Loading fixture for recent form failed: ${fixtureError.message}`);
  }
  if (!fixture) return null;

  const { data: teams, error: teamError } = await db
    .from("teams")
    .select("id, football_data_id")
    .in("id", [fixture.home_team_id, fixture.away_team_id]);
  if (teamError) {
    throw new Error(`Loading recent-form teams failed: ${teamError.message}`);
  }

  const providerIdByTeam = new Map(
    (teams ?? []).map((team) => [team.id, team.football_data_id])
  );
  const homeTeamProviderId = providerIdByTeam.get(fixture.home_team_id);
  const awayTeamProviderId = providerIdByTeam.get(fixture.away_team_id);
  if (homeTeamProviderId == null || awayTeamProviderId == null) return null;

  const { data: cached, error: cacheError } = await db
    .from("fixture_recent_form")
    .select(
      "fixture_id, home_matches, away_matches, home_lineup, away_lineup, fetched_at"
    )
    .eq("fixture_id", fixture.id)
    .maybeSingle();

  if (cacheError && !isMissingTable(cacheError)) {
    throw new Error(`Loading cached recent form failed: ${cacheError.message}`);
  }

  const stale = cached
    ? fromCachedRow(cached, homeTeamProviderId, awayTeamProviderId)
    : null;
  if (
    stale &&
    includesTeamCrests(stale) &&
    Date.now() - new Date(stale.fetchedAt).getTime() < CACHE_TTL_MS
  ) {
    return {
      form: stale,
      lineups: cached ? cachedProjectedLineups(cached) : null,
    };
  }
  if (cacheError) return stale ? { form: stale, lineups: null } : null;

  try {
    const cutoff = new Date(fixture.original_kickoff_at);
    const windowStart = new Date(cutoff);
    windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 1);
    const params = {
      status: "FINISHED",
      dateFrom: windowStart.toISOString().slice(0, 10),
      dateTo: cutoff.toISOString().slice(0, 10),
      limit: 10,
    };
    const [homeResponse, awayResponse] = await Promise.all([
      footballDataGet<WireMatchesResponse>(
        `/teams/${homeTeamProviderId}/matches`,
        params
      ),
      footballDataGet<WireMatchesResponse>(
        `/teams/${awayTeamProviderId}/matches`,
        params
      ),
    ]);
    const fetchedAt = new Date().toISOString();
    const homeMatches = recentMatchesFromResponse(
      homeResponse.data,
      fixture.original_kickoff_at
    );
    const awayMatches = recentMatchesFromResponse(
      awayResponse.data,
      fixture.original_kickoff_at
    );
    const { error: saveError } = await db.from("fixture_recent_form").upsert({
      fixture_id: fixture.id,
      home_matches: homeMatches as unknown as Json,
      away_matches: awayMatches as unknown as Json,
      home_lineup: null,
      away_lineup: null,
      fetched_at: fetchedAt,
    });
    if (saveError) {
      console.error("Caching fixture recent form failed", saveError.message);
    }

    return {
      form: {
        fixtureId: fixture.id,
        homeTeamProviderId,
        awayTeamProviderId,
        homeMatches,
        awayMatches,
        fetchedAt,
      },
      lineups: null,
    };
  } catch (error) {
    console.error("Refreshing fixture recent form failed", (error as Error).message);
    return stale
      ? {
          form: stale,
          lineups: cached ? cachedProjectedLineups(cached) : null,
        }
      : null;
  }
}

/** Loads one shared prematch snapshot, refreshing stale data from the provider. */
export async function getFixtureRecentForm(
  fixtureId: string
): Promise<FixtureRecentForm | null> {
  return (await loadFixtureRecentSnapshot(fixtureId))?.form ?? null;
}

function emptyLineupFromMatch(
  match: RecentMatch,
  teamProviderId: number
): ProjectedLineup {
  return {
    schemaVersion: 2,
    sourceMatchId: match.providerMatchId,
    sourceKickoffAt: match.kickoffAt,
    sourceOpponent:
      match.homeTeamId === teamProviderId ? match.awayTeam : match.homeTeam,
    formation: null,
    players: [],
  };
}

function hasCurrentProjectedLineupShape(value: Json | null): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.schemaVersion === 2
  );
}

async function fetchProjectedLineup(
  match: RecentMatch | undefined,
  teamProviderId: number
): Promise<ProjectedLineup | null> {
  if (!match) return null;
  try {
    const response = await footballDataGet<WireMatch>(
      `/matches/${match.providerMatchId}`,
      {},
      { unfold: true }
    );
    return (
      projectedLineupFromMatch(response.data, teamProviderId) ??
      emptyLineupFromMatch(match, teamProviderId)
    );
  } catch (error) {
    console.error(
      `Refreshing projected lineup for team ${teamProviderId} failed`,
      (error as Error).message
    );
    return emptyLineupFromMatch(match, teamProviderId);
  }
}

/** Loads the latest starting XI for both clubs, cached with the recent form. */
export async function getFixtureProjectedLineups(
  fixtureId: string
): Promise<FixtureProjectedLineups> {
  const snapshot = await loadFixtureRecentSnapshot(fixtureId);
  if (!snapshot) return { home: null, away: null };
  if (snapshot.lineups) return snapshot.lineups;
  const { form } = snapshot;

  const [home, away] = await Promise.all([
    fetchProjectedLineup(form.homeMatches[0], form.homeTeamProviderId),
    fetchProjectedLineup(form.awayMatches[0], form.awayTeamProviderId),
  ]);
  const db = createServiceRoleClient();
  const { error: saveError } = await db
    .from("fixture_recent_form")
    .update({
      home_lineup: home as unknown as Json,
      away_lineup: away as unknown as Json,
    })
    .eq("fixture_id", fixtureId);
  if (saveError) {
    console.error("Caching projected lineups failed", saveError.message);
  }

  return { home, away };
}