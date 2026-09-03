#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values
    .filter((fields) => fields.some((value) => value.trim()))
    .map((fields) => Object.fromEntries(headers.map((header, i) => [header, fields[i] ?? ""])));
}

function normalized(value) {
  return value.trim().toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const csvPath = process.argv[2];
if (!csvPath || !existsSync(csvPath)) {
  throw new Error("Usage: npm run import:squad-csv -- <path-to-csv>");
}

loadEnvFile(".env.local");
loadEnvFile(".env");
const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(", ")}`);

const season = Number(process.env.FOOTBALL_DATA_SEASON || 2026);
const rows = parseCsv(readFileSync(csvPath, "utf8").replace(/^\uFEFF/, ""));
const requiredColumns = ["team", "player", "position_group", "date_of_birth"];
for (const column of requiredColumns) {
  if (!rows.every((row) => Object.hasOwn(row, column))) throw new Error(`Missing CSV column: ${column}`);
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data: teams, error: teamError } = await db.from("teams").select("id, name, short_name");
if (teamError) throw new Error(`Reading teams failed: ${teamError.message}`);

const aliases = new Map([
  ["shakhtar donetsk", "fk shakhtar donetsk"],
  ["sk slavia prague", "sk slavia praha"],
  ["slovan bratislava", "sk slovan bratislava"],
]);
const teamByName = new Map();
for (const team of teams ?? []) {
  teamByName.set(normalized(team.name), team);
  teamByName.set(normalized(team.short_name), team);
}

const inserts = rows.map((row) => {
  const csvTeamName = normalized(row.team);
  const team = teamByName.get(csvTeamName) ?? teamByName.get(aliases.get(csvTeamName));
  if (!team) throw new Error(`No project team matches CSV team: ${row.team}`);
  const name = row.player.trim();
  if (!name) throw new Error(`Blank player name for ${row.team}`);
  const naturalKey = `${csvTeamName}|${normalized(name)}|${row.date_of_birth.trim()}`;
  const sourcePlayerId = createHash("sha256").update(naturalKey).digest("hex").slice(0, 24);
  const shirtNumber = row.shirt_number.trim() ? Number(row.shirt_number) : null;
  if (shirtNumber !== null && (!Number.isInteger(shirtNumber) || shirtNumber < 0 || shirtNumber > 99)) {
    throw new Error(`Invalid shirt number for ${name}: ${row.shirt_number}`);
  }
  return {
    season,
    team_id: team.id,
    source: "supplied-csv",
    source_player_id: sourcePlayerId,
    football_data_id: null,
    name,
    position: row.position_group.trim() || row.position.trim() || null,
    shirt_number: shirtNumber,
    nationality: row.nationality.trim() || null,
    date_of_birth: row.date_of_birth.trim() || null,
    photo_url: null,
  };
});

const duplicateKeys = inserts.map((row) => `${row.team_id}:${row.source_player_id}`);
if (new Set(duplicateKeys).size !== duplicateKeys.length) throw new Error("CSV contains duplicate players");

const teamIds = [...new Set(inserts.map((row) => row.team_id))];
const { error: deleteError } = await db
  .from("team_squad_players")
  .delete()
  .eq("season", season)
  .eq("source", "supplied-csv")
  .in("team_id", teamIds);
if (deleteError) throw new Error(`Clearing prior CSV squads failed: ${deleteError.message}`);

const { error: insertError } = await db.from("team_squad_players").insert(inserts);
if (insertError) throw new Error(`Importing CSV squads failed: ${insertError.message}`);

const counts = new Map();
for (const row of rows) counts.set(row.team, (counts.get(row.team) ?? 0) + 1);
console.log(`Imported ${inserts.length} players for season ${season}.`);
for (const [team, count] of [...counts].sort()) console.log(`${team}: ${count}`);
