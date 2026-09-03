#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_SEASON = 2026;
const UEFA_SEASON_YEAR = 2027;
const EXPECTED_MATCHES = 144;
const EXPECTED_MATCHES_PER_MATCHDAY = 18;
const DRY_RUN = process.argv.includes("--dry");
const UEFA_FIXTURES_URL =
  `https://match.uefa.com/v5/matches?competitionId=1&seasonYear=${UEFA_SEASON_YEAR}` +
  "&phase=TOURNAMENT&order=ASC&offset=0&limit=200";
const UEFA_ARTICLE_URL =
  "https://www.uefa.com/uefachampionsleague/news/02a8-2174c9e9019d-f909a77bd77a-1000--2026-27-champions-league-all-the-league-phase-fixtures/";
const MATCH_POINTS = JSON.parse(
  readFileSync(resolve(ROOT, "data/ucl_2026_27_predictions_points.json"), "utf8")
);

function loadEnvFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = raw.match(/^\s*([^#][^=]*)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missingEnv = required.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const db = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLUB_TOKENS =
  /\b(FC|CF|AC|SC|BSC|KV|SK|FK|CD|RC|AS|SS|US|BK|IF|AFC|CFC|SV|VFB|VFL|TSG|RB|LOSC|OSC)\b/gi;

const NAME_ALIASES = new Map([
  ["pae aek", "aek athens"],
  ["club atletico de madrid", "atletico madrid"],
  ["atletico de madrid", "atletico madrid"],
  ["como 1907", "como"],
  ["feyenoord rotterdam", "feyenoord"],
  ["internazionale milano", "inter"],
  ["lask linz", "lask"],
  ["racing club de lens", "lens"],
  ["real betis balompie", "real betis"],
  ["galatasaray a s", "galatasaray"],
  ["psv eindhoven", "psv"],
  ["real madrid c f", "real madrid"],
  ["sporting clube de portugal", "sporting"],
  ["sporting cp", "sporting"],
]);

function normalizeTeamName(name) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(CLUB_TOKENS, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
  return NAME_ALIASES.get(normalized) ?? normalized;
}

const pointsByFixture = new Map(
  MATCH_POINTS.games.map((game) => [
    `${normalizeTeamName(game.homeTeam)}::${normalizeTeamName(game.awayTeam)}`,
    game,
  ])
);

if (
  MATCH_POINTS.fixtureCount !== EXPECTED_MATCHES ||
  MATCH_POINTS.games.length !== EXPECTED_MATCHES ||
  pointsByFixture.size !== EXPECTED_MATCHES
) {
  throw new Error("The bundled 2026/27 match-points file is incomplete or contains duplicates");
}

function predictionPointRow(match) {
  const key = fixtureNameKey(
    officialTeamName(match.homeTeam),
    officialTeamName(match.awayTeam)
  );
  const supplied = pointsByFixture.get(key);
  if (!supplied) {
    throw new Error(
      `No prediction points supplied for ${match.homeTeam.internationalName} vs ${match.awayTeam.internationalName}`
    );
  }
  return {
    prob_home: supplied.probabilities.home / 100,
    prob_draw: supplied.probabilities.draw / 100,
    prob_away: supplied.probabilities.away / 100,
    home_win_points: supplied.points.home,
    draw_points: supplied.points.draw,
    away_win_points: supplied.points.away,
  };
}

function english(translations, field) {
  return translations?.[field]?.EN ?? null;
}

function officialTeamName(team) {
  return english(team.translations, "displayOfficialName") ?? team.internationalName;
}

function uefaTeamNameKeys(team) {
  return new Set(
    [
      team.internationalName,
      officialTeamName(team),
      english(team.translations, "displayName"),
      english(team.translations, "shortName"),
    ]
      .filter(Boolean)
      .map(normalizeTeamName)
  );
}

function stadiumName(stadium) {
  return (
    english(stadium?.translations, "officialName") ??
    english(stadium?.translations, "name") ??
    null
  );
}

function stadiumCity(stadium) {
  return english(stadium?.city?.translations, "name");
}

function hslToHex(hue, saturation, lightness) {
  const sat = saturation / 100;
  const lig = lightness / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const channel = (n) =>
    lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (value) => Math.round(value * 255).toString(16).padStart(2, "0");
  return `#${hex(channel(0))}${hex(channel(8))}${hex(channel(4))}`;
}

function colorFor(providerId) {
  let hash = Math.imul(providerId, 2654435761);
  hash ^= hash >>> 13;
  hash = Math.abs(hash);
  return hslToHex(hash % 360, 55 + (hash % 20), 38 + (hash % 12));
}

function codeFor(team) {
  const supplied = team.teamCode?.trim();
  if (supplied && /^[A-Za-z]{2,4}$/.test(supplied)) return supplied.toUpperCase();
  const letters = team.internationalName.normalize("NFD").replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 3) || "UNK").toUpperCase();
}

function fixtureNameKey(homeName, awayName) {
  return `${normalizeTeamName(homeName)}::${normalizeTeamName(awayName)}`;
}

function fixtureIdKey(homeTeamId, awayTeamId) {
  return `${homeTeamId}::${awayTeamId}`;
}

async function fetchUefaMatches() {
  const response = await fetch(UEFA_FIXTURES_URL, {
    headers: { accept: "application/json" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`UEFA fixture feed returned HTTP ${response.status}`);
  }
  const matches = await response.json();
  if (!Array.isArray(matches)) throw new Error("UEFA fixture feed did not return an array");
  return matches.filter(
    (match) =>
      match.competition?.id === "1" &&
      match.type === "GROUP_STAGE" &&
      Number(match.matchday?.sequenceNumber) >= 1 &&
      Number(match.matchday?.sequenceNumber) <= 8
  );
}

function validateSource(matches) {
  if (matches.length !== EXPECTED_MATCHES) {
    throw new Error(`Expected ${EXPECTED_MATCHES} UEFA matches, received ${matches.length}`);
  }

  const ids = new Set();
  const fixtures = new Set();
  const matchdayCounts = new Map();
  for (const match of matches) {
    const matchday = Number(match.matchday?.sequenceNumber);
    const name = `${match.homeTeam?.internationalName ?? "?"} vs ${match.awayTeam?.internationalName ?? "?"}`;
    if (!match.id || ids.has(match.id)) throw new Error(`Duplicate or missing UEFA match id: ${name}`);
    ids.add(match.id);
    if (!match.homeTeam?.id || !match.awayTeam?.id) throw new Error(`Missing team id: ${name}`);
    predictionPointRow(match);
    if (!match.kickOffTime?.dateTime) throw new Error(`Missing kickoff: ${name}`);
    if (Number.isNaN(new Date(match.kickOffTime.dateTime).getTime())) {
      throw new Error(`Invalid kickoff: ${name}`);
    }
    const fixtureKey = fixtureNameKey(
      officialTeamName(match.homeTeam),
      officialTeamName(match.awayTeam)
    );
    if (fixtures.has(fixtureKey)) throw new Error(`Duplicate fixture: ${name}`);
    fixtures.add(fixtureKey);
    matchdayCounts.set(matchday, (matchdayCounts.get(matchday) ?? 0) + 1);
  }

  for (let matchday = 1; matchday <= 8; matchday += 1) {
    const count = matchdayCounts.get(matchday) ?? 0;
    if (count !== EXPECTED_MATCHES_PER_MATCHDAY) {
      throw new Error(`Matchday ${matchday} has ${count} matches, expected ${EXPECTED_MATCHES_PER_MATCHDAY}`);
    }
  }
}

function collectUefaTeams(matches) {
  const teams = new Map();
  const homeStadiums = new Map();
  for (const match of matches) {
    teams.set(match.homeTeam.id, match.homeTeam);
    teams.set(match.awayTeam.id, match.awayTeam);
    const stadiums = homeStadiums.get(match.homeTeam.id) ?? new Map();
    if (match.stadium?.id) stadiums.set(match.stadium.id, match.stadium);
    homeStadiums.set(match.homeTeam.id, stadiums);
  }
  if (teams.size !== 36) throw new Error(`Expected 36 UEFA teams, received ${teams.size}`);
  return { teams, homeStadiums };
}

function teamInsertRow(team, homeStadiums) {
  const stadium = homeStadiums.values().next().value ?? null;
  const shortName = english(team.translations, "shortName") ?? team.internationalName;
  return {
    name: officialTeamName(team),
    short_name: shortName,
    code: codeFor(team),
    color: colorFor(Number(team.id)),
    country: english(team.translations, "countryName") ?? team.countryCode ?? "Unknown",
    logo_url: team.bigLogoUrl ?? team.mediumLogoUrl ?? team.logoUrl ?? null,
    venue_name: stadiumName(stadium),
    venue_city: stadiumCity(stadium),
    venue_capacity: stadium?.capacity ?? null,
  };
}

function fixtureRow(match, homeTeamId, awayTeamId) {
  const kickoff = new Date(match.kickOffTime.dateTime).toISOString();
  const stadium = match.stadium ?? null;
  const venueId = Number(stadium?.id);
  return {
    season: APP_SEASON,
    stage: "league_phase",
    round: `League Stage - ${Number(match.matchday.sequenceNumber)}`,
    matchday: Number(match.matchday.sequenceNumber),
    kickoff_at: kickoff,
    original_kickoff_at: kickoff,
    venue: stadiumName(stadium),
    venue_api_id: Number.isSafeInteger(venueId) ? venueId : null,
    venue_city: stadiumCity(stadium),
    venue_address: stadium?.address ?? null,
    venue_capacity: stadium?.capacity ?? null,
    venue_surface: null,
    venue_image_url:
      stadium?.images?.LARGE_ULTRA_WIDE ?? stadium?.images?.MEDIUM_WIDE ?? null,
    attendance: null,
    referee: null,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    status: "scheduled",
    ...predictionPointRow(match),
  };
}

console.log(`UEFA source: ${UEFA_ARTICLE_URL}`);
console.log(`Fetching ${APP_SEASON}/${String(APP_SEASON + 1).slice(-2)} league phase...`);

const matches = await fetchUefaMatches();
validateSource(matches);
const { teams: uefaTeams, homeStadiums } = collectUefaTeams(matches);
const matchesAwaitingVenue = matches.filter(
  (match) => !match.stadium?.id || !stadiumName(match.stadium)
);

const { data: storedTeams, error: teamReadError } = await db
  .from("teams")
  .select("id, name, short_name, logo_url, venue_name, venue_city, venue_capacity");
if (teamReadError) throw new Error(`Reading teams failed: ${teamReadError.message}`);

const storedTeamsById = new Map((storedTeams ?? []).map((team) => [team.id, team]));
const storedTeamsByName = new Map();
for (const team of storedTeams ?? []) {
  const keys = new Set([normalizeTeamName(team.name), normalizeTeamName(team.short_name)]);
  for (const key of keys) {
    const previous = storedTeamsByName.get(key);
    if (previous && previous.id !== team.id) {
      throw new Error(`Ambiguous stored team name "${key}": ${previous.name}, ${team.name}`);
    }
    storedTeamsByName.set(key, team);
  }
}

const uefaTeamByCanonicalName = new Map();
const missingUefaTeams = [];
const matchedUefaTeams = [];
for (const team of uefaTeams.values()) {
  const key = normalizeTeamName(officialTeamName(team));
  if (uefaTeamByCanonicalName.has(key)) {
    throw new Error(`Ambiguous UEFA team name: ${team.internationalName}`);
  }
  uefaTeamByCanonicalName.set(key, team);
  const matchesByName = [...uefaTeamNameKeys(team)]
    .map((nameKey) => storedTeamsByName.get(nameKey))
    .filter(Boolean);
  const distinctMatches = new Map(matchesByName.map((stored) => [stored.id, stored]));
  if (distinctMatches.size > 1) {
    throw new Error(
      `UEFA team ${team.internationalName} matches multiple stored teams: ${[...distinctMatches.values()].map((stored) => stored.name).join(", ")}`
    );
  }
  const existing = distinctMatches.values().next().value ?? null;
  if (existing) matchedUefaTeams.push({ uefa: team, stored: existing });
  else missingUefaTeams.push(team);
}

const { data: existingFixtures, error: fixtureReadError } = await db
  .from("fixtures")
  .select("id, home_team_id, away_team_id, kickoff_at, matchday")
  .eq("season", APP_SEASON)
  .eq("stage", "league_phase");
if (fixtureReadError) throw new Error(`Reading existing fixtures failed: ${fixtureReadError.message}`);

const sourceFixtureNames = new Set(
  matches.map((match) =>
    fixtureNameKey(officialTeamName(match.homeTeam), officialTeamName(match.awayTeam))
  )
);
const unexpectedFixtures = (existingFixtures ?? []).filter((fixture) => {
  const home = storedTeamsById.get(fixture.home_team_id);
  const away = storedTeamsById.get(fixture.away_team_id);
  if (!home || !away) return true;
  return !sourceFixtureNames.has(fixtureNameKey(home.name, away.name));
});
if (unexpectedFixtures.length > 0) {
  const examples = unexpectedFixtures.slice(0, 20).map((fixture) => {
    const home = storedTeamsById.get(fixture.home_team_id);
    const away = storedTeamsById.get(fixture.away_team_id);
    return `${home?.name ?? fixture.home_team_id} vs ${away?.name ?? fixture.away_team_id}`;
  });
  throw new Error(
    `Found ${unexpectedFixtures.length} existing ${APP_SEASON} league-phase fixture(s) absent from UEFA; refusing to guess or delete them: ${examples.join("; ")}`
  );
}

console.log(`Validated: ${matches.length} matches, ${uefaTeams.size} teams, 8 matchdays`);
console.log(`Existing teams matched: ${matchedUefaTeams.length}`);
console.log(`New teams required: ${missingUefaTeams.length}`);
if (missingUefaTeams.length > 0) {
  console.log(`New teams: ${missingUefaTeams.map((team) => team.internationalName).sort().join(", ")}`);
}
console.log(`Existing ${APP_SEASON} fixtures: ${(existingFixtures ?? []).length}`);
console.log(`Fixtures awaiting a UEFA stadium announcement: ${matchesAwaitingVenue.length}`);
for (const match of matchesAwaitingVenue) {
  console.log(
    `- MD${match.matchday.sequenceNumber}: ${match.homeTeam.internationalName} vs ${match.awayTeam.internationalName}`
  );
}

if (DRY_RUN) {
  const stadiumVariants = [...homeStadiums.entries()].filter(([, stadiums]) => stadiums.size > 1);
  console.log("Dry run: no database rows written.");
  console.log(`Teams using more than one home stadium: ${stadiumVariants.length}`);
  process.exit(0);
}

for (const { uefa, stored } of matchedUefaTeams) {
  const stadiums = homeStadiums.get(uefa.id) ?? new Map();
  const stadium = stadiums.values().next().value ?? null;
  const { error } = await db
    .from("teams")
    .update({
      venue_name: stadiumName(stadium),
      venue_city: stadiumCity(stadium),
      venue_capacity: stadium?.capacity ?? null,
    })
    .eq("id", stored.id);
  if (error) throw new Error(`Updating team ${stored.name} failed: ${error.message}`);
}

if (missingUefaTeams.length > 0) {
  const rows = missingUefaTeams.map((team) =>
    teamInsertRow(team, homeStadiums.get(team.id) ?? new Map())
  );
  const { error } = await db.from("teams").insert(rows);
  if (error) throw new Error(`Inserting new teams failed: ${error.message}`);
}

const { data: refreshedTeams, error: refreshedTeamError } = await db
  .from("teams")
  .select("id, name, short_name");
if (refreshedTeamError) throw new Error(`Re-reading teams failed: ${refreshedTeamError.message}`);

const refreshedTeamByCanonicalName = new Map();
for (const team of refreshedTeams ?? []) {
  refreshedTeamByCanonicalName.set(normalizeTeamName(team.name), team);
  refreshedTeamByCanonicalName.set(normalizeTeamName(team.short_name), team);
}

const teamIdByUefaId = new Map();
for (const team of uefaTeams.values()) {
  const stored = [...uefaTeamNameKeys(team)]
    .map((key) => refreshedTeamByCanonicalName.get(key))
    .find(Boolean);
  if (!stored) throw new Error(`Could not resolve stored team ${team.internationalName}`);
  teamIdByUefaId.set(team.id, stored.id);
}

const sourceRows = matches.map((match) => {
  const homeTeamId = teamIdByUefaId.get(match.homeTeam.id);
  const awayTeamId = teamIdByUefaId.get(match.awayTeam.id);
  if (!homeTeamId || !awayTeamId) {
    throw new Error(
      `Could not resolve stored teams for ${match.homeTeam.internationalName} vs ${match.awayTeam.internationalName}`
    );
  }
  return {
    uefaMatchId: match.id,
    key: fixtureIdKey(homeTeamId, awayTeamId),
    row: fixtureRow(match, homeTeamId, awayTeamId),
  };
});

const existingByKey = new Map(
  (existingFixtures ?? []).map((fixture) => [
    fixtureIdKey(fixture.home_team_id, fixture.away_team_id),
    fixture,
  ])
);
const rowsToInsert = [];
const rowsToUpdate = [];
for (const source of sourceRows) {
  const existing = existingByKey.get(source.key);
  if (existing) rowsToUpdate.push({ id: existing.id, ...source.row });
  else rowsToInsert.push(source.row);
}

if (rowsToInsert.length > 0) {
  const { error } = await db.from("fixtures").insert(rowsToInsert);
  if (error) throw new Error(`Inserting fixtures failed: ${error.message}`);
}

for (const row of rowsToUpdate) {
  const { id, ...update } = row;
  const { error } = await db.from("fixtures").update(update).eq("id", id);
  if (error) throw new Error(`Updating fixture ${id} failed: ${error.message}`);
}

const { data: verified, error: verifyError } = await db
  .from("fixtures")
  .select("id, matchday, kickoff_at, venue, venue_city, venue_address, venue_capacity")
  .eq("season", APP_SEASON)
  .eq("stage", "league_phase");
if (verifyError) throw new Error(`Verifying fixtures failed: ${verifyError.message}`);

const verifiedCounts = new Map();
for (const fixture of verified ?? []) {
  if (!fixture.kickoff_at) throw new Error(`Fixture ${fixture.id} is missing its kickoff`);
  verifiedCounts.set(fixture.matchday, (verifiedCounts.get(fixture.matchday) ?? 0) + 1);
}
if ((verified ?? []).length !== EXPECTED_MATCHES) {
  throw new Error(`Verification found ${(verified ?? []).length} fixtures, expected ${EXPECTED_MATCHES}`);
}
for (let matchday = 1; matchday <= 8; matchday += 1) {
  if (verifiedCounts.get(matchday) !== EXPECTED_MATCHES_PER_MATCHDAY) {
    throw new Error(`Verification failed for matchday ${matchday}`);
  }
}
const verifiedMissingVenues = (verified ?? []).filter((fixture) => !fixture.venue);
if (verifiedMissingVenues.length !== matchesAwaitingVenue.length) {
  throw new Error(
    `Verification found ${verifiedMissingVenues.length} undeclared venues, expected ${matchesAwaitingVenue.length}`
  );
}

console.log("");
console.log(`Teams inserted: ${missingUefaTeams.length}`);
console.log(`Teams updated with UEFA venues: ${matchedUefaTeams.length}`);
console.log(`Fixtures inserted: ${rowsToInsert.length}`);
console.log(`Fixtures updated: ${rowsToUpdate.length}`);
console.log(`Verified fixtures: ${(verified ?? []).length} (18 on every matchday)`);
console.log(`Venues stored: ${(verified ?? []).length - verifiedMissingVenues.length}`);
console.log(`Awaiting UEFA venue announcement: ${verifiedMissingVenues.length}`);
