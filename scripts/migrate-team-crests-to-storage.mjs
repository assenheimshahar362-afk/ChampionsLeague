#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "team-images";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const DRY_RUN = process.argv.includes("--dry");

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

const season = Number(
  process.env.TEAM_CATALOG_SEASON || process.env.FOOTBALL_DATA_SEASON || 2026
);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const ownedPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
const db = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function extensionFor(contentType) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/svg+xml") return "svg";
  return null;
}

async function ensureBucket() {
  const { data: buckets, error: listError } = await db.storage.listBuckets();
  if (listError) throw new Error(`Listing Storage buckets failed: ${listError.message}`);

  const options = {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
  };
  const exists = (buckets ?? []).some((bucket) => bucket.id === BUCKET);
  const { error } = exists
    ? await db.storage.updateBucket(BUCKET, options)
    : await db.storage.createBucket(BUCKET, options);
  if (error) throw new Error(`Preparing ${BUCKET} bucket failed: ${error.message}`);
}

async function downloadImage(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  const extension = extensionFor(contentType);
  if (!extension) throw new Error(`unsupported content type ${contentType || "unknown"}`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("source returned an empty file");
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`image is larger than ${MAX_IMAGE_BYTES} bytes`);
  }
  return { bytes, contentType, extension };
}

async function storeImage(sourceUrl, objectStem) {
  const image = await downloadImage(sourceUrl);
  if (DRY_RUN) return { publicUrl: null, byteLength: image.bytes.byteLength };

  const objectPath = `${objectStem}.${image.extension}`;
  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(objectPath, image.bytes, {
      cacheControl: "31536000",
      contentType: image.contentType,
      upsert: true,
    });
  if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

  return {
    publicUrl: db.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl,
    byteLength: image.bytes.byteLength,
  };
}

const { data: teams, error: teamError } = await db
  .from("teams")
  .select("id, football_data_id, name, logo_url")
  .order("name");
if (teamError) throw new Error(`Reading teams failed: ${teamError.message}`);

const { data: candidates, error: candidateError } = await db
  .from("season_team_candidates")
  .select("candidate_id, football_data_id, team_id, name_en, logo_url")
  .eq("season", season)
  .order("rank");
if (candidateError) throw new Error(`Reading team candidates failed: ${candidateError.message}`);

if (!DRY_RUN) await ensureBucket();

let migratedTeams = 0;
let migratedCandidates = 0;
let alreadyOwned = 0;
const failures = [];
const ownedUrlByTeamId = new Map();
const ownedUrlByProviderId = new Map();

for (const team of teams ?? []) {
  if (!team.logo_url) continue;

  let publicUrl = team.logo_url;
  if (team.logo_url.startsWith(ownedPrefix)) {
    alreadyOwned += 1;
  } else {
    try {
      const objectId = team.football_data_id ?? team.id;
      const stored = await storeImage(team.logo_url, `clubs/${objectId}`);
      if (DRY_RUN) {
        console.log(`${team.name}: ready (${stored.byteLength} bytes)`);
        continue;
      }
      publicUrl = stored.publicUrl;
      const { error: updateError } = await db
        .from("teams")
        .update({ logo_url: publicUrl })
        .eq("id", team.id);
      if (updateError) throw new Error(`database update failed: ${updateError.message}`);
      migratedTeams += 1;
      console.log(`${team.name}: stored`);
    } catch (error) {
      failures.push(`${team.name}: ${error.message}`);
      continue;
    }
  }

  ownedUrlByTeamId.set(team.id, publicUrl);
  if (team.football_data_id !== null) {
    ownedUrlByProviderId.set(team.football_data_id, publicUrl);
  }
}

if (!DRY_RUN) {
  for (const candidate of candidates ?? []) {
    const linkedUrl =
      (candidate.team_id ? ownedUrlByTeamId.get(candidate.team_id) : null) ??
      (candidate.football_data_id !== null
        ? ownedUrlByProviderId.get(candidate.football_data_id)
        : null);
    if (linkedUrl) {
      if (candidate.logo_url !== linkedUrl) {
        const { error: updateError } = await db
          .from("season_team_candidates")
          .update({ logo_url: linkedUrl })
          .eq("season", season)
          .eq("candidate_id", candidate.candidate_id);
        if (updateError) {
          failures.push(`${candidate.name_en}: database update failed: ${updateError.message}`);
          continue;
        }
      }
      continue;
    }

    if (!candidate.logo_url) continue;
    if (candidate.logo_url.startsWith(ownedPrefix)) {
      alreadyOwned += 1;
      continue;
    }

    try {
      const stored = await storeImage(
        candidate.logo_url,
        `catalogs/${season}/${candidate.candidate_id}`
      );
      const { error: updateError } = await db
        .from("season_team_candidates")
        .update({ logo_url: stored.publicUrl })
        .eq("season", season)
        .eq("candidate_id", candidate.candidate_id);
      if (updateError) throw new Error(`database update failed: ${updateError.message}`);
      migratedCandidates += 1;
      console.log(`${candidate.name_en}: stored`);
    } catch (error) {
      failures.push(`${candidate.name_en}: ${error.message}`);
    }
  }
}

const { data: verifiedTeams, error: verifyTeamError } = await db
  .from("teams")
  .select("name, logo_url")
  .not("logo_url", "is", null);
if (verifyTeamError) throw new Error(`Verifying teams failed: ${verifyTeamError.message}`);

const { data: verifiedCandidates, error: verifyCandidateError } = await db
  .from("season_team_candidates")
  .select("name_en, logo_url")
  .eq("season", season)
  .not("logo_url", "is", null);
if (verifyCandidateError) {
  throw new Error(`Verifying team candidates failed: ${verifyCandidateError.message}`);
}

const outsideStorage = [
  ...(verifiedTeams ?? []).flatMap((team) =>
    team.logo_url?.startsWith(ownedPrefix) ? [] : [`team: ${team.name}`]
  ),
  ...(verifiedCandidates ?? []).flatMap((candidate) =>
    candidate.logo_url?.startsWith(ownedPrefix)
      ? []
      : [`season ${season} candidate: ${candidate.name_en}`]
  ),
];

console.log("");
console.log(`Season catalog: ${season}`);
console.log(`Teams with crests: ${(verifiedTeams ?? []).length}`);
console.log(`Candidates with crests: ${(verifiedCandidates ?? []).length}`);
console.log(DRY_RUN ? "Dry run: no files uploaded." : `Team crests migrated: ${migratedTeams}`);
if (!DRY_RUN) console.log(`Candidate-only crests migrated: ${migratedCandidates}`);
console.log(`Already in Storage: ${alreadyOwned}`);
console.log(`Still outside Storage: ${outsideStorage.length}`);
if (failures.length > 0 || outsideStorage.length > 0) {
  console.log("");
  console.log("Incomplete crests:");
  for (const failure of failures) console.log(`- ${failure}`);
  for (const record of outsideStorage) console.log(`- ${record}`);
}

if (!DRY_RUN && outsideStorage.length > 0) process.exitCode = 2;
