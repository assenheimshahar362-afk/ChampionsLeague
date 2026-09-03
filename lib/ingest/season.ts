import "server-only";

import { footballDataGet } from "@/lib/football-data/client";
import {
  normalizeTeamName,
  regulationScore,
  scorerToCandidate,
  stageFromProvider,
  toFixtureResultRow,
  toFixtureRow,
  toTeamRow,
} from "@/lib/football-data/mappers";
import type {
  WireCompetitionTeamsResponse,
  WireMatch,
  WireMatchesResponse,
  WireScorer,
  WireScorersResponse,
  WireTeam,
} from "@/lib/football-data/types";
import { serverEnv } from "@/lib/env.server";
import { createRebaser } from "@/lib/fixtures/rebase";
import {
  probabilitiesFrom,
  ratingsAsOf,
  type PlayedMatch,
} from "@/lib/scoring/ratings";
import {
  rankPlayerCandidates,
  rankTeamCandidates,
} from "@/lib/season-picks/scoring";
import {
  championApiId,
  topScorerApiIds,
} from "@/lib/season-picks/outcomes";
import { publicEnv } from "@/lib/env";
import { normalizePersonName } from "@/lib/fixtures/localization";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const COMPETITION = "CL";
const SQUAD_REFRESH_MS = 7 * 24 * 60 * 60_000;
const TEAM_IMAGE_PREFIX = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/team-images/`;

function isOwnedTeamImage(url: string | null): url is string {
  return url?.startsWith(TEAM_IMAGE_PREFIX) ?? false;
}

const CURATED_TEAM_NAME_ALIASES: Record<string, string> = {
  "pae aek": "AEK Athens",
  "bayern munchen": "Bayern Munich",
  "inter": "Inter Milan",
  "internazionale milano": "Inter Milan",
  "atletico de madrid": "Atletico Madrid",
  "manchester city": "Man City",
  "manchester united": "Man Utd",
  "paris saint germain": "PSG",
  "paris sg": "PSG",
  "psv eindhoven": "PSV",
  "sporting cp": "Sporting",
  "lask": "LASK Linz",
};

export type IngestReport = {
  season: number;
  dryRun: boolean;
  rebase: { enabled: boolean; pivot: string; scale: number; ingestTime: string };
  fetched: { teams: number; fixtures: number; scorers: number };
  skippedQualifiers: number;
  teamsUpserted: number;
  fixturesInserted: number;
  fixturesUpdated: number;
  resultsUpserted: number;
  teamCandidatesUpserted: number;
  playerCandidatesUpserted: number;
  squadPlayersUpserted: number;
  seasonOutcomePrepared: boolean;
  quota: { requestsAvailable: number | null; resetSeconds: number | null };
  warnings: string[];
};

export async function ingestSeason(
  options: { dryRun?: boolean } = {}
): Promise<IngestReport> {
  const dryRun = options.dryRun ?? false;
  const env = serverEnv();
  const season = env.FOOTBALL_DATA_SEASON;
  const warnings: string[] = [];

  const teamsResponse = await footballDataGet<WireCompetitionTeamsResponse>(
    `/competitions/${COMPETITION}/teams`,
    { season }
  );
  const fixturesResponse = await footballDataGet<WireMatchesResponse>(
    `/competitions/${COMPETITION}/matches`,
    { season }
  );

  let scorers: WireScorer[] = [];
  let latestQuota = fixturesResponse.quota;
  try {
    const response = await footballDataGet<WireScorersResponse>(
      `/competitions/${COMPETITION}/scorers`,
      { season, limit: 50 }
    );
    scorers = response.data.scorers;
    latestQuota = response.quota;
  } catch (error) {
    warnings.push(
      `Top-scorer candidates were not refreshed. Football-Data Deep Data may be required: ${(error as Error).message}`
    );
  }

  const wireTeams = teamsResponse.data.teams;
  const wireFixtures = fixturesResponse.data.matches;
  if (wireFixtures.length === 0) {
    throw new Error(
      `No Champions League fixtures returned for season ${season}; check FOOTBALL_DATA_SEASON and subscription coverage.`
    );
  }

  const inScope = wireFixtures.filter(
    (fixture) => stageFromProvider(fixture.stage) !== null
  );
  const skippedQualifiers = wireFixtures.length - inScope.length;
  const participatingIds = new Set<number>();
  for (const fixture of inScope) {
    participatingIds.add(fixture.homeTeam.id);
    participatingIds.add(fixture.awayTeam.id);
  }

  const teamRows = wireTeams
    .filter((team) => participatingIds.has(team.id))
    .map(toTeamRow);
  const knownTeamIds = new Set(teamRows.map((team) => team.football_data_id));
  const orphaned = [...participatingIds].filter((id) => !knownTeamIds.has(id));
  if (orphaned.length > 0) {
    warnings.push(
      `${orphaned.length} team(s) appear in matches but not in the team response: ${orphaned.join(", ")}.`
    );
  }
  const usable = inScope.filter(
    (fixture) =>
      knownTeamIds.has(fixture.homeTeam.id) &&
      knownTeamIds.has(fixture.awayTeam.id)
  );

  const ingestTime = new Date();
  const rebase = createRebaser({
    enabled: env.REBASE_ENABLED,
    pivot: new Date(env.REBASE_PIVOT),
    scale: env.REBASE_SCALE,
    ingestTime,
  });

  const played: PlayedMatch[] = usable.flatMap((fixture) => {
    const score = regulationScore(fixture);
    return score.home === null || score.away === null
      ? []
      : [{
          homeTeamId: String(fixture.homeTeam.id),
          awayTeamId: String(fixture.awayTeam.id),
          homeGoals: score.home,
          awayGoals: score.away,
          kickoffAt: fixture.utcDate,
        }];
  });
  const candidateCutoff = env.REBASE_ENABLED
    ? new Date(env.REBASE_PIVOT)
    : ingestTime;
  const candidateRatings = ratingsAsOf(played, candidateCutoff);
  const rankedTeams = rankTeamCandidates(
    teamRows.map((team) => ({
      teamId: team.football_data_id,
      strength:
        candidateRatings.get(String(team.football_data_id))?.strength ?? 0,
    }))
  );
  const rankedPlayers = rankPlayerCandidates(
    scorers
      .filter((scorer) => participatingIds.has(scorer.team.id))
      .map((scorer, index) => scorerToCandidate(scorer, index + 1))
  );
  const outcomeChampionApiId = championApiId(usable);
  const outcomeTopScorerApiIds = topScorerApiIds(scorers);

  function probabilitiesForFixture(fixture: WireMatch) {
    const ratings = ratingsAsOf(played, new Date(fixture.utcDate));
    return probabilitiesFrom(
      ratings.get(String(fixture.homeTeam.id)),
      ratings.get(String(fixture.awayTeam.id))
    );
  }

  const report: IngestReport = {
    season,
    dryRun,
    rebase: {
      enabled: env.REBASE_ENABLED,
      pivot: env.REBASE_PIVOT,
      scale: env.REBASE_SCALE,
      ingestTime: ingestTime.toISOString(),
    },
    fetched: {
      teams: wireTeams.length,
      fixtures: wireFixtures.length,
      scorers: scorers.length,
    },
    skippedQualifiers,
    teamsUpserted: 0,
    fixturesInserted: 0,
    fixturesUpdated: 0,
    resultsUpserted: 0,
    teamCandidatesUpserted: 0,
    playerCandidatesUpserted: 0,
    squadPlayersUpserted: 0,
    seasonOutcomePrepared:
      outcomeChampionApiId !== null && outcomeTopScorerApiIds.length > 0,
    quota: latestQuota,
    warnings,
  };

  if (dryRun) {
    report.teamsUpserted = teamRows.length;
    report.fixturesInserted = usable.length;
    report.resultsUpserted = played.length;
    report.teamCandidatesUpserted = rankedTeams.length;
    report.playerCandidatesUpserted = rankedPlayers.length;
    report.squadPlayersUpserted = wireTeams
      .filter((team) => participatingIds.has(team.id))
      .reduce(
        (count, team) =>
          count +
          (team.squad ?? []).filter(
            (player) => player.id !== null && Boolean(player.name?.trim())
          ).length,
        0
      );
    return report;
  }

  const db = createServiceRoleClient();
  const { data: existingTeams, error: existingTeamError } = await db
    .from("teams")
    .select("id, football_data_id, name, short_name, logo_url");
  if (existingTeamError) {
    throw new Error(`Reading existing teams failed: ${existingTeamError.message}`);
  }

  const teamByProviderId = new Map(
    (existingTeams ?? []).flatMap((team) =>
      team.football_data_id === null
        ? []
        : [[team.football_data_id, team] as const]
    )
  );
  const teamByName = new Map<string, NonNullable<typeof existingTeams>[number]>();
  for (const team of existingTeams ?? []) {
    teamByName.set(normalizeTeamName(team.name), team);
    teamByName.set(normalizeTeamName(team.short_name), team);
  }

  const teamsToInsert = [];
  for (const row of teamRows) {
    const existing =
      teamByProviderId.get(row.football_data_id) ??
      teamByName.get(normalizeTeamName(row.name)) ??
      teamByName.get(normalizeTeamName(row.short_name));
    if (existing) {
      const preservedRow = isOwnedTeamImage(existing.logo_url)
        ? { ...row, logo_url: existing.logo_url }
        : row;
      const { error } = await db
        .from("teams")
        .update(preservedRow)
        .eq("id", existing.id);
      if (error) throw new Error(`Updating team ${row.name} failed: ${error.message}`);
    } else {
      teamsToInsert.push(row);
    }
  }
  if (teamsToInsert.length > 0) {
    const { error } = await db.from("teams").insert(teamsToInsert);
    if (error) throw new Error(`Inserting teams failed: ${error.message}`);
  }
  report.teamsUpserted = teamRows.length;

  const { data: storedTeams, error: storedTeamError } = await db
    .from("teams")
    .select("id, football_data_id, logo_url");
  if (storedTeamError) {
    throw new Error(`Reading back teams failed: ${storedTeamError.message}`);
  }
  const teamUuidByProviderId = new Map<number, string>(
    (storedTeams ?? []).flatMap((team) =>
      team.football_data_id === null
        ? []
        : [[team.football_data_id, team.id] as const]
    )
  );
  const teamLogoByProviderId = new Map<number, string>(
    (storedTeams ?? []).flatMap((team) =>
      team.football_data_id === null || team.logo_url === null
        ? []
        : [[team.football_data_id, team.logo_url] as const]
    )
  );

  const [{ data: playerCatalog, error: playerCatalogError }, { data: existingSquad, error: squadReadError }] =
    await Promise.all([
      db
        .from("season_player_candidates")
        .select("football_data_id, name_en, photo_url")
        .eq("season", season),
      db
        .from("team_squad_players")
        .select("team_id, source, source_player_id, football_data_id, photo_url, updated_at")
        .eq("season", season),
    ]);
  if (playerCatalogError) {
    throw new Error(`Reading player photos failed: ${playerCatalogError.message}`);
  }
  if (squadReadError) {
    throw new Error(`Reading stored team squads failed: ${squadReadError.message}`);
  }

  const playerImagePrefix = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/player-images/`;
  const candidatePhotoById = new Map(
    (playerCatalog ?? []).flatMap((player) =>
      player.football_data_id !== null && player.photo_url?.startsWith(playerImagePrefix)
        ? [[player.football_data_id, player.photo_url] as const]
        : []
    )
  );
  const candidatePhotoByName = new Map(
    (playerCatalog ?? []).flatMap((player) =>
      player.photo_url?.startsWith(playerImagePrefix)
        ? [[normalizePersonName(player.name_en), player.photo_url] as const]
        : []
    )
  );
  const storedPhotoByPlayer = new Map(
    (existingSquad ?? []).flatMap((player) =>
      player.photo_url
        ? [[`${player.team_id}:${player.football_data_id}`, player.photo_url] as const]
        : []
    )
  );

  let teamsWithSquads = 0;
  let squadRefreshFailures = 0;
  for (const team of wireTeams.filter((row) => participatingIds.has(row.id))) {
    const teamId = teamUuidByProviderId.get(team.id);
    if (!teamId) continue;
    const storedTeamSquad = (existingSquad ?? []).filter(
      (player) => player.team_id === teamId
    );
    let rawSquad = team.squad ?? [];
    if (rawSquad.length === 0) {
      const newestStoredAt = storedTeamSquad.reduce(
        (newest, player) => Math.max(newest, new Date(player.updated_at).getTime()),
        0
      );
      const storedSquadIsFresh =
        storedTeamSquad.length > 0 && Date.now() - newestStoredAt < SQUAD_REFRESH_MS;
      if (storedSquadIsFresh) {
        teamsWithSquads += 1;
        continue;
      }

      try {
        const teamResponse = await footballDataGet<WireTeam>(`/teams/${team.id}`);
        rawSquad = teamResponse.data.squad ?? [];
        report.quota = teamResponse.quota;
      } catch (error) {
        squadRefreshFailures += 1;
        if (storedTeamSquad.length > 0) teamsWithSquads += 1;
        console.error(`Refreshing ${team.name} squad failed`, (error as Error).message);
        continue;
      }
    }

    const squad = rawSquad.flatMap((player) =>
      player.id === null || !player.name?.trim()
        ? []
        : [{ ...player, id: player.id, name: player.name.trim() }]
    );
    if (squad.length === 0) continue;

    teamsWithSquads += 1;
    const squadRows = squad.map((player) => ({
      season,
      team_id: teamId,
      source: "football-data",
      source_player_id: String(player.id),
      football_data_id: player.id,
      name: player.name,
      position: player.position ?? null,
      shirt_number: player.shirtNumber ?? null,
      nationality: player.nationality ?? null,
      date_of_birth: player.dateOfBirth ?? null,
      photo_url:
        candidatePhotoById.get(player.id) ??
        candidatePhotoByName.get(normalizePersonName(player.name)) ??
        storedPhotoByPlayer.get(`${teamId}:${player.id}`) ??
        null,
    }));
    const { error: squadUpsertError } = await db
      .from("team_squad_players")
      .upsert(squadRows, {
        onConflict: "season,team_id,source,source_player_id",
      });
    if (squadUpsertError) {
      throw new Error(`Saving ${team.name} squad failed: ${squadUpsertError.message}`);
    }

    const currentIds = new Set(squad.map((player) => player.id));
    const staleIds = (existingSquad ?? [])
      .filter(
        (player) =>
          player.team_id === teamId &&
          player.source === "football-data" &&
          player.football_data_id !== null &&
          !currentIds.has(player.football_data_id)
      )
      .flatMap((player) =>
        player.football_data_id === null ? [] : [player.football_data_id]
      );
    if (staleIds.length > 0) {
      const { error: staleSquadError } = await db
        .from("team_squad_players")
        .delete()
        .eq("season", season)
        .eq("team_id", teamId)
        .in("football_data_id", staleIds);
      if (staleSquadError) {
        throw new Error(`Pruning ${team.name} squad failed: ${staleSquadError.message}`);
      }
    }
    report.squadPlayersUpserted += squadRows.length;
  }
  if (teamsWithSquads === 0) {
    warnings.push(
      "Football-Data returned no squad lists; existing stored squads were left unchanged."
    );
  } else if (teamsWithSquads < teamRows.length) {
    warnings.push(
      `Squads are available for ${teamsWithSquads} of ${teamRows.length} participating teams.`
    );
  }
  if (squadRefreshFailures > 0) {
    warnings.push(`${squadRefreshFailures} team squad refresh request(s) failed.`);
  }

  const outcomeChampionTeamId =
    outcomeChampionApiId === null
      ? undefined
      : teamUuidByProviderId.get(outcomeChampionApiId);

  const curatedTeamSeason = 2026;
  if (season <= curatedTeamSeason) {
    const { data: teamCatalog, error: teamCatalogError } = await db
      .from("season_team_candidates")
      .select("candidate_id, name_en")
      .eq("season", curatedTeamSeason);
    if (teamCatalogError) {
      throw new Error(`Reading curated team catalog failed: ${teamCatalogError.message}`);
    }
    const candidateByName = new Map(
      (teamCatalog ?? []).map((candidate) => [
        normalizeTeamName(candidate.name_en),
        candidate.candidate_id,
      ])
    );
    let linkedTeams = 0;
    for (const team of wireTeams) {
      const normalizedNames = [team.name, team.shortName ?? team.name].map(normalizeTeamName);
      const alias = normalizedNames
        .map((name) => CURATED_TEAM_NAME_ALIASES[name])
        .find(Boolean);
      const candidateId = normalizedNames
        .map((name) => candidateByName.get(name))
        .find((id) => id !== undefined) ??
        (alias ? candidateByName.get(normalizeTeamName(alias)) : undefined);
      const teamId = teamUuidByProviderId.get(team.id);
      if (!candidateId || !teamId) continue;
      const { error } = await db
        .from("season_team_candidates")
        .update({
          football_data_id: team.id,
          team_id: teamId,
          logo_url: teamLogoByProviderId.get(team.id) ?? team.crest,
        })
        .eq("season", curatedTeamSeason)
        .eq("candidate_id", candidateId);
      if (error) {
        throw new Error(`Linking curated team ${team.name} failed: ${error.message}`);
      }
      linkedTeams += 1;
    }
    if (season === curatedTeamSeason && linkedTeams < teamRows.length) {
      warnings.push(
        `Football-Data linked ${linkedTeams} of ${teamRows.length} participating teams to the curated market.`
      );
    }
  }

  if (outcomeChampionTeamId && outcomeTopScorerApiIds.length > 0) {
    const { data: existingOutcome, error: outcomeReadError } = await db
      .from("season_outcomes")
      .select("released_at")
      .eq("season", season)
      .maybeSingle();
    if (outcomeReadError) {
      throw new Error(`Reading season outcome failed: ${outcomeReadError.message}`);
    }
    if (!existingOutcome?.released_at) {
      const { error } = await db.from("season_outcomes").upsert({
        season,
        champion_team_id: outcomeChampionTeamId,
        top_scorer_football_data_ids: outcomeTopScorerApiIds,
      });
      if (error) throw new Error(`Preparing season outcome failed: ${error.message}`);
      report.seasonOutcomePrepared = true;
    }
  }

  const { data: existingPick, error: pickReadError } = await db
    .from("season_picks")
    .select("id")
    .eq("season", season)
    .limit(1)
    .maybeSingle();
  if (pickReadError) throw new Error(`Reading season picks failed: ${pickReadError.message}`);

  if (season === 2026 && rankedPlayers.length > 0) {
    const { data: catalog, error: catalogError } = await db
      .from("season_player_candidates")
      .select("candidate_id, name_en")
      .eq("season", season);
    if (catalogError) {
      throw new Error(`Reading curated player catalog failed: ${catalogError.message}`);
    }
    const candidateByName = new Map(
      (catalog ?? []).map((candidate) => [
        normalizeTeamName(candidate.name_en),
        candidate.candidate_id,
      ])
    );
    let linkedPlayers = 0;
    for (const player of rankedPlayers) {
      const candidateId = candidateByName.get(normalizeTeamName(player.name));
      if (!candidateId) continue;
      const { error } = await db
        .from("season_player_candidates")
        .update({
          football_data_id: player.footballDataId,
          team_id: teamUuidByProviderId.get(player.teamApiId) ?? null,
          position: player.position,
          source_goals: player.goals,
          source_assists: player.assists,
        })
        .eq("season", season)
        .eq("candidate_id", candidateId);
      if (error) {
        throw new Error(`Linking curated player ${player.name} failed: ${error.message}`);
      }
      linkedPlayers += 1;
    }
    if (linkedPlayers < rankedPlayers.length) {
      warnings.push(
        `Football-Data linked ${linkedPlayers} of ${rankedPlayers.length} scorer rows to the curated catalog.`
      );
    }
  }

  if (existingPick) {
    warnings.push(`Season ${season} candidate prices are frozen because picks already exist.`);
  } else {
    if (season !== 2026) {
      const { error: clearTeamError } = await db
        .from("season_team_candidates")
        .delete()
        .eq("season", season);
      if (clearTeamError) throw new Error(`Clearing team candidates failed: ${clearTeamError.message}`);

      const teamCandidateRows = rankedTeams.flatMap((candidate) => {
        const teamId = teamUuidByProviderId.get(candidate.teamId);
        const team = wireTeams.find((row) => row.id === candidate.teamId);
        return teamId && team
          ? [{
              season,
              football_data_id: candidate.teamId,
              team_id: teamId,
              name_en: team.name,
              name_he: team.name,
              logo_url: teamLogoByProviderId.get(team.id) ?? team.crest,
              implied_probability: candidate.impliedProbability,
              pick_points: candidate.pickPoints,
              rank: candidate.rank,
            }]
          : [];
      });
      if (teamCandidateRows.length > 0) {
        const { error } = await db.from("season_team_candidates").insert(teamCandidateRows);
        if (error) throw new Error(`Inserting team candidates failed: ${error.message}`);
        report.teamCandidatesUpserted = teamCandidateRows.length;
      }
    } else {
      warnings.push("Season 2026 champion odds use the curated database catalog and were not replaced by provider rankings.");
    }

    if (rankedPlayers.length > 0 && season !== 2026) {
      const { error: clearPlayerError } = await db
        .from("season_player_candidates")
        .delete()
        .eq("season", season);
      if (clearPlayerError) throw new Error(`Clearing player candidates failed: ${clearPlayerError.message}`);
      const playerCandidateRows = rankedPlayers.flatMap((candidate) => {
        const teamId = teamUuidByProviderId.get(candidate.teamApiId);
        return teamId
          ? [{
              season,
              football_data_id: candidate.footballDataId,
              name_en: candidate.name,
              name_he: candidate.name,
              photo_url: null,
              team_id: teamId,
              team_name_en: wireTeams.find((team) => team.id === candidate.teamApiId)?.name ?? "Unknown",
              team_name_he: wireTeams.find((team) => team.id === candidate.teamApiId)?.name ?? "Unknown",
              position: candidate.position,
              source_goals: candidate.goals,
              source_assists: candidate.assists,
              source_rating: candidate.rating,
              implied_probability: candidate.impliedProbability,
              pick_points: candidate.pickPoints,
              rank: candidate.rank,
            }]
          : [];
      });
      if (playerCandidateRows.length > 0) {
        const { error } = await db.from("season_player_candidates").insert(playerCandidateRows);
        if (error) throw new Error(`Inserting player candidates failed: ${error.message}`);
        report.playerCandidatesUpserted = playerCandidateRows.length;
      }
    } else if (season === 2026) {
      warnings.push("Season 2026 player odds use the curated database catalog and were not replaced by provider rankings.");
    }
  }

  const { data: existingFixtures, error: existingFixtureError } = await db
    .from("fixtures")
    .select("id, football_data_id, home_team_id, away_team_id, original_kickoff_at, status");
  if (existingFixtureError) {
    throw new Error(`Reading existing fixtures failed: ${existingFixtureError.message}`);
  }
  const fixtureByProviderId = new Map(
    (existingFixtures ?? []).flatMap((fixture) =>
      fixture.football_data_id === null
        ? []
        : [[fixture.football_data_id, fixture] as const]
    )
  );
  const fixtureKey = (home: string, away: string, kickoff: string) =>
    `${home}:${away}:${new Date(kickoff).toISOString()}`;
  const fixtureByLegacyKey = new Map(
    (existingFixtures ?? []).map((fixture) => [
      fixtureKey(fixture.home_team_id, fixture.away_team_id, fixture.original_kickoff_at),
      fixture,
    ])
  );

  for (const wire of usable) {
    const base = toFixtureRow(wire, rebase(wire.utcDate));
    if (!base) continue;
    const homeId = teamUuidByProviderId.get(base.home_team_provider_id);
    const awayId = teamUuidByProviderId.get(base.away_team_provider_id);
    if (!homeId || !awayId) continue;
    const probabilities = probabilitiesForFixture(wire);
    const shared = {
      football_data_id: base.football_data_id,
      season,
      stage: base.stage,
      round: base.round,
      matchday: base.matchday,
      original_kickoff_at: base.original_kickoff_at,
      attendance: base.attendance,
      referee: base.referee,
      home_team_id: homeId,
      away_team_id: awayId,
      prob_home: probabilities.home,
      prob_draw: probabilities.draw,
      prob_away: probabilities.away,
    };
    const existing =
      fixtureByProviderId.get(base.football_data_id) ??
      fixtureByLegacyKey.get(fixtureKey(homeId, awayId, base.original_kickoff_at)) ??
      (existingFixtures ?? []).find(
        (fixture) =>
          fixture.football_data_id === null &&
          fixture.home_team_id === homeId &&
          fixture.away_team_id === awayId &&
          Math.abs(
            new Date(fixture.original_kickoff_at).getTime() -
              new Date(base.original_kickoff_at).getTime()
          ) <=
            12 * 60 * 60_000
      );
    if (existing) {
      const update = {
        ...shared,
        ...(base.venue ? { venue: base.venue } : {}),
        ...(!env.REBASE_ENABLED && existing.status === "scheduled"
          ? { kickoff_at: base.kickoff_at }
          : {}),
      };
      const { error } = await db.from("fixtures").update(update).eq("id", existing.id);
      if (error) throw new Error(`Updating fixture ${wire.id} failed: ${error.message}`);
      report.fixturesUpdated += 1;
    } else {
      const { error } = await db.from("fixtures").insert({
        ...shared,
        venue: base.venue,
        kickoff_at: base.kickoff_at,
      });
      if (error) throw new Error(`Inserting fixture ${wire.id} failed: ${error.message}`);
      report.fixturesInserted += 1;
    }
  }

  const { data: storedFixtures, error: storedFixtureError } = await db
    .from("fixtures")
    .select("id, football_data_id");
  if (storedFixtureError) {
    throw new Error(`Re-reading fixtures failed: ${storedFixtureError.message}`);
  }
  const fixtureUuidByProviderId = new Map<number, string>(
    (storedFixtures ?? []).flatMap((fixture) =>
      fixture.football_data_id === null
        ? []
        : [[fixture.football_data_id, fixture.id] as const]
    )
  );
  const resultRows = usable.flatMap((wire) => {
    const result = toFixtureResultRow(wire);
    const fixtureId = fixtureUuidByProviderId.get(result.football_data_id);
    return !fixtureId || result.home_goals === null || result.away_goals === null
      ? []
      : [{
          fixture_id: fixtureId,
          status: result.status,
          home_goals: result.home_goals,
          away_goals: result.away_goals,
          went_to_extra_time: result.went_to_extra_time,
          elapsed_minutes: result.elapsed_minutes,
        }];
  });
  if (resultRows.length > 0) {
    const { error } = await db
      .from("fixture_results")
      .upsert(resultRows, { onConflict: "fixture_id", ignoreDuplicates: true });
    if (error) throw new Error(`Upserting results failed: ${error.message}`);
    report.resultsUpserted = resultRows.length;
  }

  return report;
}
