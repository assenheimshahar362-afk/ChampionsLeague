#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "player-images";
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

const season = Number(process.env.PLAYER_CATALOG_SEASON || 2026);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const ownedPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
const db = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function extensionFor(contentType) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return null;
}

async function ensureBucket() {
  const { data: buckets, error: listError } = await db.storage.listBuckets();
  if (listError) throw new Error(`Listing Storage buckets failed: ${listError.message}`);

  const options = {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
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

const { data: candidates, error: candidateError } = await db
  .from("season_player_candidates")
  .select("candidate_id, name_en, photo_url")
  .eq("season", season)
  .order("rank");
if (candidateError) throw new Error(`Reading player candidates failed: ${candidateError.message}`);

if (!DRY_RUN) await ensureBucket();

let migrated = 0;
let alreadyOwned = 0;
const failures = [];
for (const candidate of candidates ?? []) {
  if (!candidate.photo_url) {
    failures.push(`${candidate.name_en}: no source photo URL`);
    continue;
  }
  if (candidate.photo_url.startsWith(ownedPrefix)) {
    alreadyOwned += 1;
    continue;
  }

  try {
    const image = await downloadImage(candidate.photo_url);
    if (DRY_RUN) {
      console.log(`${candidate.name_en}: ready (${image.bytes.byteLength} bytes)`);
      continue;
    }

    const objectPath = `${season}/${candidate.candidate_id}.${image.extension}`;
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(objectPath, image.bytes, {
        cacheControl: "31536000",
        contentType: image.contentType,
        upsert: true,
      });
    if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = db.storage.from(BUCKET).getPublicUrl(objectPath);
    const { error: updateError } = await db
      .from("season_player_candidates")
      .update({ photo_url: publicUrlData.publicUrl })
      .eq("season", season)
      .eq("candidate_id", candidate.candidate_id);
    if (updateError) throw new Error(`database update failed: ${updateError.message}`);

    migrated += 1;
    console.log(`${candidate.name_en}: stored`);
  } catch (error) {
    failures.push(`${candidate.name_en}: ${error.message}`);
  }
}

const { data: verified, error: verifyError } = await db
  .from("season_player_candidates")
  .select("name_en, photo_url")
  .eq("season", season);
if (verifyError) throw new Error(`Verifying player candidates failed: ${verifyError.message}`);

const { data: storedObjects, error: objectError } = await db.storage
  .from(BUCKET)
  .list(String(season), { limit: 1_000 });
if (objectError) throw new Error(`Verifying stored files failed: ${objectError.message}`);
const objectNames = new Set((storedObjects ?? []).map((object) => object.name));
const incomplete = (verified ?? []).filter(
  (candidate) => {
    if (!candidate.photo_url?.startsWith(ownedPrefix)) return true;
    const objectName = decodeURIComponent(candidate.photo_url.split("/").at(-1) ?? "");
    return !objectNames.has(objectName);
  }
);

console.log("");
console.log(`Season: ${season}`);
console.log(`Candidates: ${(candidates ?? []).length}`);
console.log(DRY_RUN ? "Dry run: no files uploaded." : `Photos migrated: ${migrated}`);
console.log(`Already in Storage: ${alreadyOwned}`);
console.log(`Storage objects verified: ${objectNames.size}`);
console.log(`Still outside Storage: ${incomplete.length}`);
if (failures.length > 0) {
  console.log("");
  console.log("Incomplete candidates:");
  for (const failure of failures) console.log(`- ${failure}`);
}

if (!DRY_RUN && incomplete.length > 0) process.exitCode = 2;
