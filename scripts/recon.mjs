#!/usr/bin/env node
/**
 * Football-Data.org v4 reconnaissance.
 *
 * Saves the exact bodies and response headers used by the app. Calls are
 * spaced by 6.2 seconds so the free plan's 10 requests/minute cap is respected.
 *
 *   node scripts/recon.mjs --dry-run
 *   node scripts/recon.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "docs/football-data-samples");
const DRY_RUN = process.argv.includes("--dry-run");

function loadEnvFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
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

const TOKEN = process.env.FOOTBALL_DATA_API_TOKEN;
const BASE_URL = (
  process.env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4"
).replace(/\/$/, "");
const SEASON = Number(process.env.FOOTBALL_DATA_SEASON || 2026);
const calls = [];
let lastCallAt = 0;

async function waitForQuota() {
  const remaining = lastCallAt + 6_200 - Date.now();
  if (remaining > 0) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, remaining));
  }
}

async function call(name, endpoint, params = {}, unfold = false) {
  const url = new URL(BASE_URL + endpoint);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  if (DRY_RUN) {
    console.log(`  ${name.padEnd(18)} ${url.pathname}${url.search}`);
    return null;
  }

  await waitForQuota();
  lastCallAt = Date.now();
  const response = await fetch(url, {
    headers: {
      "X-Auth-Token": TOKEN,
      ...(unfold
        ? {
            "X-Unfold-Lineups": "true",
            "X-Unfold-Bookings": "true",
            "X-Unfold-Subs": "true",
            "X-Unfold-Goals": "true",
          }
        : {}),
    },
  });
  const headers = Object.fromEntries(response.headers.entries());
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { unparseable: text.slice(0, 2_000) };
  }
  const snapshot = {
    meta: { url: url.toString(), status: response.status },
    body,
  };
  await writeFile(
    resolve(OUT, `${name}.json`),
    JSON.stringify(snapshot, null, 2)
  );
  await writeFile(
    resolve(OUT, `${name}.headers.json`),
    JSON.stringify(headers, null, 2)
  );
  calls.push({ name, url: url.toString(), status: response.status, headers });
  console.log(
    `  ${response.ok ? "ok" : "xx"} ${name.padEnd(15)} HTTP ${response.status}`
  );
  return response.ok ? body : null;
}

async function main() {
  if (!TOKEN && !DRY_RUN) {
    console.error(
      "\nFOOTBALL_DATA_API_TOKEN is missing. Add it to .env.local and retry.\n"
    );
    process.exitCode = 1;
    return;
  }
  await mkdir(OUT, { recursive: true });
  console.log(`\nFootball-Data.org v4 reconnaissance (season ${SEASON})\n`);

  await call("competition", "/competitions/CL");
  await call("teams", "/competitions/CL/teams", { season: SEASON });
  const matches = await call("matches", "/competitions/CL/matches", {
    season: SEASON,
  });
  await call("scorers", "/competitions/CL/scorers", {
    season: SEASON,
    limit: 50,
  });

  const matchId = matches?.matches?.find((match) => match.status === "FINISHED")?.id
    ?? matches?.matches?.[0]?.id;
  if (matchId) {
    await call("match-detail", `/matches/${matchId}`, {}, true);
    await call("head-to-head", `/matches/${matchId}/head2head`, { limit: 20 });
  }

  if (!DRY_RUN) {
    await writeFile(resolve(OUT, "_calls.json"), JSON.stringify(calls, null, 2));
  }
  console.log("\nDone.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
