"use client";

import { BookOpen, CalendarDays, ListOrdered, Trophy, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The mobile tab bar.
 *
 * Phones only — from `md` up the site header already carries the same
 * destinations across the top, and a tab bar pinned to the bottom of a desktop
 * window is a phone idiom worn in the wrong place.
 *
 * Fixed rather than sticky, and outside the scrolling flow, so it behaves like
 * a native tab bar: always reachable, never scrolled past. The layout pays for
 * that with matching bottom padding on the body, so the footer's last line is
 * never hidden underneath it.
 *
 * No animation on the active state beyond colour. This is the control people
 * touch most in the app — tens of times a session — and §"how often will users
 * see this" puts anything moving here firmly in the "don't" column.
 */

const TABS = [
  { href: "/", key: "games", Icon: CalendarDays },
  { href: "/leaderboard", key: "table", Icon: Trophy },
  { href: "/standings", key: "standings", Icon: ListOrdered },
  { href: "/profile", key: "profile", Icon: UserRound },
  { href: "/rules", key: "rules", Icon: BookOpen },
] as const;

export function BottomNav() {
  const t = useTranslations("nav");
  // Already locale-stripped by next-intl, so "/" is "/" under both languages.
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        "bg-background/85 border-t border-white/10 backdrop-blur-xl",
        // The home indicator on a modern iPhone sits inside the viewport, so
        // without this the last row of labels is under the user's thumb bar.
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {TABS.map(({ href, key, Icon }) => {
          // Exact match for the matchday, prefix match for the rest: a nested
          // route under /standings should keep its tab lit, but every path in
          // the app starts with "/" and would otherwise light up the first tab.
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1",
                  "ease-tint transition-colors duration-150",
                  "focus-visible:ring-ring focus-visible:ring-inset focus-visible:ring-2 focus-visible:outline-none",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {/* Never colour alone (§8): the active tab is also the only one
                    whose label is set in a heavier weight. */}
                <Icon
                  className={cn("size-5 shrink-0", active && "stroke-[2.4]")}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-[10px] leading-none",
                    active ? "font-bold" : "font-medium"
                  )}
                >
                  {t(key)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
