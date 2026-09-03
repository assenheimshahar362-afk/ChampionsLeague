#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_FIXTURE_ID = "26270000-0000-4000-8000-000000000001";
const SEASON = 2026;

function loadEnvFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return;

  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Supabase service credentials are not configured.");
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: source, error: sourceError } = await db
  .from("fixtures")
  .select(
    "season, stage, round, matchday, home_team_id, away_team_id, prob_home, prob_draw, prob_away"
  )
  .eq("season", SEASON)
  .eq("status", "scheduled")
  .order("kickoff_at", { ascending: true })
  .limit(1)
  .single();

if (sourceError || !source) {
  console.error(`Could not find a 2026/27 fixture to use for the demo: ${sourceError?.message ?? "not found"}`);
  process.exit(1);
}

const kickoff = new Date(Date.now() - 12 * 60_000).toISOString();
const { error } = await db.from("fixtures").upsert({
  id: DEMO_FIXTURE_ID,
  api_football_id: null,
  football_data_id: null,
  season: source.season,
  stage: source.stage,
  round: source.round,
  matchday: source.matchday,
  kickoff_at: kickoff,
  original_kickoff_at: kickoff,
  venue: "Demo match — predictions locked",
  home_team_id: source.home_team_id,
  away_team_id: source.away_team_id,
  status: "live",
  home_goals: 0,
  away_goals: 0,
  elapsed_minutes: 12,
  went_to_extra_time: false,
  prob_home: source.prob_home,
  prob_draw: source.prob_draw,
  prob_away: source.prob_away,
}, { onConflict: "id" });

if (error) {
  console.error(`Creating the locked demo fixture failed: ${error.message}`);
  process.exit(1);
}

console.log(`Locked demo fixture created: ${DEMO_FIXTURE_ID}`);
