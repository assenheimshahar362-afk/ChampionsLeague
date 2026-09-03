#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "player-images";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 10;
const UPLOAD_CONCURRENCY = 8;
const API_MIN_INTERVAL_MS = 6_500;
const requestedTeamNames = process.argv
  .find((argument) => argument.startsWith("--teams="))
  ?.slice("--teams=".length)
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

const TEAM_API_IDS = {
  "FC Bayern München": 157,
  "SK Slavia Praha": 560,
  "Sabah FK": 13976,
};

const TEAM_ALIASES = {
  "AS Roma": ["Roma", "AS Roma"],
  "Arsenal FC": ["Arsenal", "Arsenal"],
  "Aston Villa FC": ["Aston Villa", "Aston Villa"],
  "Borussia Dortmund": ["Dortmund", "Borussia Dortmund"],
  "Club Atlético de Madrid": ["Atletico Madrid", "Atletico Madrid"],
  "Club Brugge KV": ["Club Brugge", "Club Brugge KV"],
  "Como 1907": ["Como", "Como"],
  "FC Barcelona": ["Barcelona", "Barcelona"],
  "FC Bayern München": ["Bayern Munich", "Bayern München"],
  "FC Internazionale Milano": ["Inter", "Inter"],
  "FC Porto": ["FC Porto", "FC Porto"],
  "FK Bodø/Glimt": ["Bodo", "Bodo/Glimt"],
  "FK Shakhtar Donetsk": ["Shakhtar Donetsk", "Shakhtar Donetsk"],
  "Fenerbahçe SK": ["Fenerbahce", "Fenerbahce"],
  "Feyenoord Rotterdam": ["Feyenoord", "Feyenoord"],
  "Galatasaray SK": ["Galatasaray", "Galatasaray"],
  "LASK Linz": ["Lask Linz", "Lask Linz"],
  "Lille OSC": ["Lille", "Lille"],
  "Liverpool FC": ["Liverpool", "Liverpool"],
  "Manchester City FC": ["Manchester City", "Manchester City"],
  "Manchester United FC": ["Manchester United", "Manchester United"],
  "PAE AEK": ["AEK Athens", "AEK Athens FC"],
  "PSV": ["PSV Eindhoven", "PSV Eindhoven"],
  "Paris Saint-Germain FC": ["Paris Saint Germain", "Paris Saint Germain"],
  "RB Leipzig": ["RB Leipzig", "RB Leipzig"],
  "Racing Club de Lens": ["Lens", "Lens"],
  "Real Betis Balompié": ["Real Betis", "Real Betis"],
  "Real Madrid CF": ["Real Madrid", "Real Madrid"],
  "SK Slavia Praha": ["Slavia Prague", "Slavia Praha"],
  "SSC Napoli": ["Napoli", "Napoli"],
  "Sabah FK": ["Sabah FK", "Sabah FA"],
  "Sporting Clube de Portugal": ["Sporting CP", "Sporting CP"],
  "VfB Stuttgart": ["Stuttgart", "VfB Stuttgart"],
  "Viking FK": ["Viking", "Viking"],
  "Villarreal CF": ["Villarreal", "Villarreal"],
  "ŠK Slovan Bratislava": ["Slovan Bratislava", "Slovan Bratislava"],
};

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
    ) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function normalize(value) {
  return value
    .toLocaleLowerCase()
    .replace(/[æðđłøœþ]/g, (letter) => ({ æ: "ae", ð: "d", đ: "d", ł: "l", ø: "o", œ: "oe", þ: "th" })[letter] ?? letter)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function positionGroup(position) {
  const value = normalize(position ?? "");
  if (value.includes("goal")) return "goalkeeper";
  if (value.includes("def")) return "defender";
  if (value.includes("mid")) return "midfielder";
  if (value.includes("forward") || value.includes("attack")) return "forward";
  return value;
}

function nameScore(apiPlayer, storedPlayer) {
  const apiName = normalize(apiPlayer.name);
  const storedName = normalize(storedPlayer.name);
  if (apiName === storedName) return 200;

  const apiTokens = apiName.split(" ").filter(Boolean);
  const storedTokens = storedName.split(" ").filter(Boolean);
  let score = 0;
  if (apiTokens.length === 1 && storedTokens.includes(apiTokens[0])) score += 85;
  if (apiTokens.length >= 2) {
    const apiLast = apiTokens.at(-1);
    const storedLast = storedTokens.at(-1);
    if (apiLast === storedLast) score += 80;
    if (apiTokens[0].length === 1 && storedTokens[0]?.startsWith(apiTokens[0])) score += 35;
    if (storedTokens.includes(apiLast)) score += 25;
  }
  if (
    apiPlayer.number !== null &&
    storedPlayer.shirt_number !== null &&
    apiPlayer.number === storedPlayer.shirt_number
  ) score += 40;
  if (positionGroup(apiPlayer.position) === positionGroup(storedPlayer.position)) score += 15;
  return score;
}

function matchSquad(apiPlayers, storedPlayers) {
  const used = new Set();
  const matches = [];
  for (const apiPlayer of apiPlayers) {
    const ranked = storedPlayers
      .map((storedPlayer, index) => ({ storedPlayer, index, score: nameScore(apiPlayer, storedPlayer) }))
      .filter((candidate) => !used.has(candidate.index))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const runnerUp = ranked[1];
    if (!best || best.score < 95 || (runnerUp && best.score === runnerUp.score)) continue;
    used.add(best.index);
    matches.push({ apiPlayer, storedPlayer: best.storedPlayer });
  }
  return matches;
}

function teamMatchScore(candidateName, expectedName) {
  const candidate = normalize(candidateName);
  const expected = normalize(expectedName);
  if (candidate === expected) return 100;
  const candidateTokens = new Set(candidate.split(" "));
  const expectedTokens = new Set(expected.split(" "));
  const overlap = [...expectedTokens].filter((token) => candidateTokens.has(token)).length;
  return (overlap / Math.max(candidateTokens.size, expectedTokens.size)) * 80;
}

async function mapLimit(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const required = ["API_FOOTBALL_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(", ")}`);

const season = Number(process.env.FOOTBALL_DATA_SEASON || 2026);
const apiBase = (process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io").replace(/\/$/, "");
const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
let apiRequests = 0;
let lastApiRequestAt = 0;

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function apiGet(path) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const remainingDelay = API_MIN_INTERVAL_MS - (Date.now() - lastApiRequestAt);
    if (remainingDelay > 0) await wait(remainingDelay);
    const response = await fetch(`${apiBase}${path}`, {
      headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
    });
    lastApiRequestAt = Date.now();
    apiRequests += 1;
    const body = await response.json();
    const errors = body.errors ?? {};
    if (response.ok && Object.keys(errors).length === 0) return body.response ?? [];
    if (errors.rateLimit && attempt < 4) {
      console.log("API minute limit reached; waiting before retrying…");
      await wait(15_000);
      continue;
    }
    throw new Error(`API-Football ${path} failed: ${JSON.stringify(errors ?? response.status)}`);
  }
  return [];
}

const [{ data: fixtures, error: fixtureError }, { data: teams, error: teamError }] = await Promise.all([
  db.from("fixtures").select("home_team_id, away_team_id").eq("season", season),
  db.from("teams").select("id, name, short_name, api_football_id"),
]);
if (fixtureError || teamError) throw fixtureError ?? teamError;

const squadRows = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db
    .from("team_squad_players")
    .select("*")
    .eq("season", season)
    .range(offset, offset + 999);
  if (error) throw error;
  squadRows.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}

const participatingIds = new Set((fixtures ?? []).flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]));
const participatingTeams = (teams ?? []).filter(
  (team) =>
    participatingIds.has(team.id) &&
    (!requestedTeamNames || requestedTeamNames.includes(team.name))
);
if (participatingTeams.length === 0) throw new Error(`No participating teams found for season ${season}`);

const resolvedTeams = [];
for (const [index, team] of participatingTeams.entries()) {
  let apiTeamId = team.api_football_id;
  let apiTeamName = team.name;
  if (apiTeamId === null) {
    const knownApiId = TEAM_API_IDS[team.name];
    if (knownApiId) {
      apiTeamId = knownApiId;
      apiTeamName = TEAM_ALIASES[team.name]?.[1] ?? team.name;
    } else {
      const [query, expected] = TEAM_ALIASES[team.name] ?? [team.short_name, team.short_name];
      const candidates = await apiGet(`/teams?search=${encodeURIComponent(query)}`);
      const ranked = candidates
        .map((candidate) => ({ candidate, score: teamMatchScore(candidate.team.name, expected) }))
        .filter(({ candidate }) => !/women|wfc|u\d{2}|youth|reserve| ii$/i.test(candidate.team.name))
        .sort((a, b) => b.score - a.score);
      if (!ranked[0] || ranked[0].score < 60) {
        console.warn(`[${index + 1}/${participatingTeams.length}] No safe team match for ${team.name}`);
        continue;
      }
      apiTeamId = ranked[0].candidate.team.id;
      apiTeamName = ranked[0].candidate.team.name;
    }
    const { error } = await db.from("teams").update({ api_football_id: apiTeamId }).eq("id", team.id);
    if (error) throw new Error(`Saving API-Football id for ${team.name} failed: ${error.message}`);
  }
  resolvedTeams.push({ ...team, apiTeamId, apiTeamName });
  console.log(`[${index + 1}/${participatingTeams.length}] ${team.name} -> ${apiTeamName} (${apiTeamId})`);
}

const matchedPlayers = [];
for (const [index, team] of resolvedTeams.entries()) {
  const response = await apiGet(`/players/squads?team=${team.apiTeamId}`);
  const apiPlayers = response[0]?.players ?? [];
  const storedPlayers = (squadRows ?? []).filter((player) => player.team_id === team.id);
  const matches = matchSquad(apiPlayers, storedPlayers);
  matchedPlayers.push(...matches.map((match) => ({ ...match, team })));
  console.log(
    `Squad [${index + 1}/${resolvedTeams.length}] ${team.name}: ${matches.length}/${storedPlayers.length} matched`
  );
}

const downloads = (await mapLimit(matchedPlayers, DOWNLOAD_CONCURRENCY, async (match) => {
  if (!match.apiPlayer.photo) return null;
  const response = await fetch(match.apiPlayer.photo, { redirect: "follow" });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  const hash = createHash("sha256").update(bytes).digest("hex");
  return { ...match, bytes, hash, contentType };
})).filter(Boolean);

const hashCounts = new Map();
for (const image of downloads) hashCounts.set(image.hash, (hashCounts.get(image.hash) ?? 0) + 1);
const realImages = downloads.filter((image) => (hashCounts.get(image.hash) ?? 0) < 5);
const placeholders = downloads.length - realImages.length;

const uploaded = (await mapLimit(realImages, UPLOAD_CONCURRENCY, async (image) => {
  const objectPath = `api-football/${image.apiPlayer.id}.png`;
  const { error } = await db.storage.from(BUCKET).upload(objectPath, image.bytes, {
    contentType: image.contentType,
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) {
    console.warn(`Upload failed for ${image.storedPlayer.name}: ${error.message}`);
    return null;
  }
  return { ...image, publicUrl: `${storagePrefix}${objectPath}` };
})).filter(Boolean);

const uploadedBySquadKey = new Map(
  uploaded.map((image) => [
    `${image.storedPlayer.team_id}:${image.storedPlayer.source}:${image.storedPlayer.source_player_id}`,
    image.publicUrl,
  ])
);
const updatedSquadRows = (squadRows ?? []).map((player) => {
  const publicUrl = uploadedBySquadKey.get(`${player.team_id}:${player.source}:${player.source_player_id}`);
  return publicUrl ? { ...player, photo_url: publicUrl } : player;
});
for (let index = 0; index < updatedSquadRows.length; index += 200) {
  const { error } = await db.from("team_squad_players").upsert(updatedSquadRows.slice(index, index + 200), {
    onConflict: "season,team_id,source,source_player_id",
  });
  if (error) throw new Error(`Updating squad photos failed: ${error.message}`);
}

const { data: candidates, error: candidateError } = await db
  .from("season_player_candidates")
  .select("*")
  .eq("season", season);
if (candidateError) throw new Error(`Reading player candidates failed: ${candidateError.message}`);
const photoByTeamAndName = new Map(
  uploaded.map((image) => [`${image.team.id}:${normalize(image.storedPlayer.name)}`, image.publicUrl])
);
const updatedCandidates = (candidates ?? []).map((candidate) => {
  const publicUrl = candidate.team_id
    ? photoByTeamAndName.get(`${candidate.team_id}:${normalize(candidate.name_en)}`)
    : null;
  return publicUrl ? { ...candidate, photo_url: publicUrl } : candidate;
});
if (updatedCandidates.length > 0) {
  const { error } = await db.from("season_player_candidates").upsert(updatedCandidates, {
    onConflict: "season,candidate_id",
  });
  if (error) throw new Error(`Updating candidate photos failed: ${error.message}`);
}

console.log("");
console.log(`API requests: ${apiRequests}`);
console.log(`Teams resolved: ${resolvedTeams.length}/${participatingTeams.length}`);
console.log(`Players matched: ${matchedPlayers.length}/${squadRows.length}`);
console.log(`Photos stored: ${uploaded.length}`);
console.log(`Placeholder images discarded: ${placeholders}`);
