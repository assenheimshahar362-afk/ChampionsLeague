#!/usr/bin/env node
/**
 * Prepares the app mark for the web.
 *
 * The source drop is a ~2.5 MB 1254px PNG — fine as a master, far too heavy to
 * ship as either a favicon or a 28px header mark. This produces:
 *
 *   app/icon.png          512px, the tab icon (Next's `icon` convention)
 *   app/apple-icon.png    180px, flattened, the iOS home-screen icon
 *   app/favicon.ico       16/32/48px, for /favicon.ico requests
 *   public/logo.webp      256px, the mark used inside the app
 *   public/icon-192.png    *   public/icon-512.png    > the web app manifest set (see app/manifest.ts)
 *   public/icon-maskable-512.png  /
 *
 * Re-run after replacing public/logo.png:
 *   node scripts/optimize-logo.mjs
 */

import { writeFile, stat } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "public/logo.png");

/**
 * iOS composites a home-screen icon onto black and then masks it to a
 * squircle, so the source's transparent corners would darken the edges of an
 * already dark icon. Flattening onto the app background instead keeps the
 * rounded frame reading as deliberate.
 */
const APPLE_BACKGROUND = "#030c22";

async function report(path) {
  const { size } = await stat(path);
  console.log(`  ${relative(ROOT, path).padEnd(22)} ${(size / 1024).toFixed(1)} kB`);
}

/**
 * A modern .ico is a container: each entry may hold a raw PNG rather than the
 * legacy BMP-with-mask, which is what every browser since IE11 reads. That
 * makes the whole file a 22-byte header per size plus the PNGs themselves.
 */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    // 0 means 256 in this field; every size here is smaller, but keep the
    // wrap so the encoder stays correct if a 256px entry is ever added.
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt8(0, 2); // palette size, 0 for truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const source = sharp(SRC);
const { width, height } = await source.metadata();
console.log(`source ${relative(ROOT, SRC)} ${width}x${height}`);

const png = (size, palette = false) =>
  sharp(SRC)
    .resize(size, size, { fit: "contain", background: "#00000000" })
    .png({ compressionLevel: 9, palette, quality: 90 });

/**
 * 256px, quantised. The source is photographic, which PNG compresses badly —
 * 512px truecolour lands at 643 kB, and this is a file every visitor fetches
 * to draw something 16px wide. Quantising to a palette takes it to ~36 kB with
 * no visible cost at tab size.
 */
const iconPath = resolve(ROOT, "app/icon.png");
await writeFile(iconPath, await png(256, true).toBuffer());
await report(iconPath);

// --- iOS home screen -------------------------------------------------------
const applePath = resolve(ROOT, "app/apple-icon.png");
await writeFile(
  applePath,
  await sharp(SRC)
    .resize(180, 180)
    .flatten({ background: APPLE_BACKGROUND })
    .png({ compressionLevel: 9 })
    .toBuffer()
);
await report(applePath);

// --- /favicon.ico ----------------------------------------------------------
const icoPath = resolve(ROOT, "app/favicon.ico");
const sizes = [16, 32, 48];
const entries = await Promise.all(
  sizes.map(async (size) => ({ size, data: await png(size).toBuffer() }))
);
await writeFile(icoPath, buildIco(entries));
await report(icoPath);

// --- the mark used inside the app -----------------------------------------
const webpPath = resolve(ROOT, "public/logo.webp");
await writeFile(webpPath, await sharp(SRC).resize(256, 256).webp({ quality: 90 }).toBuffer());
await report(webpPath);

// --- web app manifest icons ------------------------------------------------
// Two `any` sizes, which is what the install criteria ask for.
for (const size of [192, 512]) {
  const path = resolve(ROOT, `public/icon-${size}.png`);
  await writeFile(path, await png(size, true).toBuffer());
  await report(path);
}

/**
 * The maskable variant. Android crops an installed icon to whatever shape the
 * launcher uses, guaranteeing only a centre circle of 80% diameter survives —
 * so the artwork is inset to that safe zone and the margin filled with the app
 * background. Shipping only an `any` icon means the launcher either mattes it
 * on white or clips the rounded frame off the corners.
 */
const maskablePath = resolve(ROOT, "public/icon-maskable-512.png");
const SAFE_ZONE = 0.8;
const inner = Math.round(512 * SAFE_ZONE);
await writeFile(
  maskablePath,
  await sharp(SRC)
    .resize(inner, inner)
    .extend({
      top: (512 - inner) / 2,
      bottom: (512 - inner) / 2,
      left: (512 - inner) / 2,
      right: (512 - inner) / 2,
      background: APPLE_BACKGROUND,
    })
    .flatten({ background: APPLE_BACKGROUND })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer()
);
await report(maskablePath);
