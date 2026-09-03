#!/usr/bin/env node
/**
 * Season ingestion CLI.
 *
 * A thin client for POST /api/cron/ingest. It deliberately does NOT re-implement
 * the ingest: the API client and the mappers import `server-only`, which throws
 * outside a Next runtime, and a second copy of that logic in plain JS would be
 * free to drift from the one that actually runs in production.
 *
 * So this needs the dev server up:
 *
 *   npm run dev
 *   npm run ingest             # real run
 *   npm run ingest -- --dry    # plan it, write nothing
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry");

function loadEnvFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return;

  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
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

const SECRET = process.env.CRON_SECRET;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);

if (!SECRET) {
  console.error(
    "\nx CRON_SECRET is not set.\n\n" +
      "  Add it to .env.local (16+ characters):\n" +
      "    CRON_SECRET=some_long_random_string\n"
  );
  process.exit(1);
}

const url = `${APP_URL}/api/cron/ingest${DRY_RUN ? "?dry=1" : ""}`;

console.log(`\nIngesting season -> ${url}`);
console.log(DRY_RUN ? "mode: DRY RUN (no writes)\n" : "mode: live\n");

let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
  });
} catch (error) {
  console.error(
    `\nx Could not reach ${APP_URL}: ${error.message}\n\n` +
      "  Is the dev server running?  npm run dev\n"
  );
  process.exit(1);
}

const body = await res.json().catch(() => null);

if (!res.ok || !body?.ok) {
  console.error(`\nx Ingest failed (HTTP ${res.status})`);
  if (body?.error) console.error(`  ${body.error}`);
  if (body?.providerError) {
    console.error(`  provider: ${JSON.stringify(body.providerError)}`);
  }
  console.error("");
  process.exit(1);
}

const r = body.report;

console.log("-".repeat(64));
console.log(`season             ${r.season}`);
console.log(
  `fetched            ${r.fetched.teams} teams, ${r.fetched.fixtures} fixtures, ${r.fetched.scorers} scorers`
);
console.log(`skipped qualifiers ${r.skippedQualifiers}`);
console.log(
  `rebase             ${
    r.rebase.enabled
      ? `on   pivot=${r.rebase.pivot} scale=${r.rebase.scale}`
      : "off  (provider kickoffs used as-is)"
  }`
);
console.log("-".repeat(64));
console.log(`teams upserted     ${r.teamsUpserted}`);
console.log(`fixtures inserted  ${r.fixturesInserted}`);
console.log(`fixtures updated   ${r.fixturesUpdated}`);
console.log(`results stored     ${r.resultsUpserted}`);
console.log(`team pick options  ${r.teamCandidatesUpserted}`);
console.log(`player pick options ${r.playerCandidatesUpserted}`);
console.log(`squad players      ${r.squadPlayersUpserted}`);
console.log(`season outcome     ${r.seasonOutcomePrepared ? "prepared" : "not ready"}`);
console.log(
  `api quota left     ${r.quota.requestsAvailable ?? "?"} (reset in ${r.quota.resetSeconds ?? "?"}s)`
);
console.log("-".repeat(64));

for (const warning of r.warnings ?? []) console.log(`!  ${warning}`);

console.log(DRY_RUN ? "\nDry run: nothing was written.\n" : "\nDone.\n");
