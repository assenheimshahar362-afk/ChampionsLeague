import Image from "next/image";

import type { Team } from "@/lib/fixtures/types";
import { cn } from "@/lib/utils";

/**
 * The club crest.
 *
 * Renders the real badge from Football-Data.org's CDN when the team has one, and
 * falls back to the club's code on a generated colour when it does not. The
 * fallback is not dead code: `logo_url` is nullable, and the colour is
 * synthesised from the team id rather than being a claim about the club's real
 * palette (see `colorFor` in lib/football-data/mappers.ts).
 *
 * The box is sized entirely by `className`, and both paths fill it exactly, so
 * a row never reflows depending on which one is used. The default is the small
 * inline size; the matchday card passes a much larger one.
 */

/** Relative luminance (WCAG), used to choose legible text over the club colour. */
function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(clean.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function TeamCrest({
  team,
  className,
}: {
  team: Team;
  className?: string;
}) {
  // The team name sits directly beneath in every layout that uses this, so the
  // crest is decoration either way.
  if (team.logoUrl) {
    return (
      <span
        className={cn(
          "inline-flex h-8 w-12 items-center justify-center select-none",
          className
        )}
        aria-hidden="true"
      >
        <Image
          src={team.logoUrl}
          alt=""
          // Intrinsic size only — the rendered size comes from the box. Asking
          // for more than the box needs keeps the badge sharp on a 3× screen.
          width={128}
          height={128}
          // Badges are wildly different shapes; contain keeps them whole
          // instead of cropping a tall crest to a wide box.
          className="h-full w-full object-contain"
          // Crests are tiny and repeat down the list, so the network round trip
          // costs more than the bytes saved by optimising them.
          unoptimized
        />
      </span>
    );
  }

  // Light club colours (Dortmund yellow, Real gold) need dark text; the rest
  // take white. Choosing per club keeps every crest readable in both themes.
  const onLight = luminance(team.color) > 0.45;

  return (
    <span
      className={cn(
        "inline-flex h-8 w-12 items-center justify-center rounded-xl text-sm font-bold tracking-tight shadow-sm ring-1 ring-black/20 select-none",
        className
      )}
      style={{
        backgroundColor: team.color,
        color: onLight ? "#111111" : "#ffffff",
      }}
      aria-hidden="true"
    >
      {team.code}
    </span>
  );
}
