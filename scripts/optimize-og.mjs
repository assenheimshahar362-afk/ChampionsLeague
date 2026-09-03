#!/usr/bin/env node
/**
 * Prepares the link-preview image for the web.
 *
 * WhatsApp, iMessage and Telegram drop a preview whose image is too heavy —
 * the 1200x630 master lands around 1.2 MB, well past that budget — so the
 * shipped asset is a JPEG instead:
 *
 *   public/alufot-og.jpg  the image referenced by og:image and twitter:image
 *
 * Re-run after replacing public/alufot-og.png:
 *   node scripts/optimize-og.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "public/alufot-og.png");
const OUT = resolve(ROOT, "public/alufot-og.jpg");

/** Scrapers that refuse to render a preview above roughly this weight. */
const BUDGET_BYTES = 300 * 1024;

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const input = await readFile(SRC);
const meta = await sharp(input).metadata();
console.log(`source: ${meta.width}x${meta.height}  ${kb(input.length)}`);

// The artwork is a dark blue gradient carrying thin neon strokes and white
// text. Palette PNG dithers that gradient into visible grain, and chroma
// subsampling softens the text edges, so this keeps full chroma.
const jpeg = await sharp(input)
  .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" })
  .toBuffer();

await writeFile(OUT, jpeg);
console.log(
  `alufot-og.jpg: ${kb(jpeg.length)}  (${(
    (1 - jpeg.length / input.length) * 100
  ).toFixed(0)}% smaller)`
);

if (jpeg.length > BUDGET_BYTES) {
  console.error(`over the ${kb(BUDGET_BYTES)} preview budget — lower the quality`);
  process.exitCode = 1;
}
