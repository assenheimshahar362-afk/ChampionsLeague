import type { MetadataRoute } from "next";

/**
 * The web app manifest — what makes the app installable.
 *
 * A manifest served over HTTPS is the whole requirement on current browsers;
 * no service worker is involved, because nothing here works offline and
 * pretending otherwise would ship a cache that serves stale fixtures.
 *
 * Deliberately single-locale. There is one manifest URL for the origin, so it
 * cannot follow next-intl the way a page does. `start_url` is the unprefixed
 * root, which means an installed launch goes through the same locale detection
 * as a cold visit — the app opens in the language the device asks for rather
 * than in whichever one happened to be open at install time.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Alufot",
    short_name: "Alufot",
    description: "Predict every Champions League match. Outscore your friends.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#030c22",
    theme_color: "#030c22",
    categories: ["sports", "games"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops to the launcher's shape; see scripts/optimize-logo.mjs.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
