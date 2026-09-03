import Image from "next/image";

import { BACKGROUND_BLUR_DATA_URL } from "@/lib/background-blur";

/**
 * The stadium backdrop, fixed behind the whole app.
 *
 * Three things make a photographic background safe to put under body text:
 *
 *  - It is `fixed`, so it behaves like a room the content scrolls through
 *    rather than a texture that drags a repaint down the page.
 *  - A vertical scrim fades it to solid `--background` well before the bottom
 *    of the viewport, so the long fixture list is always read against a flat
 *    colour rather than a lit pitch.
 *  - There is one theme, so it is simply always on. It used to be gated to
 *    dark, back when a light theme existed and a night photograph under it
 *    read as grime rather than atmosphere.
 *
 * Purely decorative, so it carries an empty alt and is hidden from assistive
 * technology.
 */
export function AppBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* `priority` because this is the largest paint on first load; letting it
          lazy-load would guarantee a visible pop-in. */}
      <Image
        src="/back.webp"
        alt=""
        fill
        priority
        quality={70}
        sizes="100vw"
        placeholder="blur"
        blurDataURL={BACKGROUND_BLUR_DATA_URL}
        // object-center: a phone shows the whole frame regardless, so this only
        // decides what a landscape viewport keeps — and the middle band holds
        // the bowl and floodlights, the most legible part of the picture.
        className="object-cover object-center opacity-90"
      />

      {/* Duotone. The photograph is a blue-lit stadium and so is the palette,
          but they are not the same blue — the tint locks the picture to the
          one the tokens use so the background does not read as a second,
          slightly-off theme. `mix-blend-color` moves the hue and leaves the
          luminance alone, which keeps the floodlights reading as light. */}
      <div className="absolute inset-0 bg-[oklch(0.46_0.18_260)] opacity-45 mix-blend-color" />

      {/* Even, gentle scrim. With the full frame in play the sky sits top and
          the pitch bottom, so weighting either end would suppress half the
          composition. Text never sits directly on this — cards are opaque, the
          header and progress bar are blurred surfaces, and the footer carries
          its own backdrop. */}
      <div className="from-background/45 via-background/30 to-background/45 absolute inset-0 bg-gradient-to-b" />
    </div>
  );
}
