"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, localeNames, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Two-locale switcher rendered as a segmented control of flags.
 *
 * Uses the locale-aware pathname so switching keeps the user on the page they
 * were reading — bouncing to the home page mid-matchday would be hostile.
 *
 * Both options stay on screen rather than one button that cycles: with two
 * locales a segmented control costs the same space and never asks the user to
 * guess what a tap will do.
 *
 * A flag is not a language — the two do not map cleanly, which is why the real
 * name rides along in `sr-only` text and in the accessible name. The picture is
 * for recognition at 20px; the word is what actually says what it is.
 */

/** Union Jack, simplified: the saltires are unoffset at this size. */
function FlagEn() {
  return (
    <svg viewBox="0 0 30 20" className="h-full w-full" aria-hidden="true">
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="2" />
      <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6.6" />
      <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="4" />
    </svg>
  );
}

function FlagHe() {
  return (
    <svg viewBox="0 0 30 20" className="h-full w-full" aria-hidden="true">
      <rect width="30" height="20" fill="#fff" />
      <path d="M0 3h30M0 17h30" stroke="#0038B8" strokeWidth="2.6" />
      {/* Two overlaid triangles rather than a traced star: at this size the
          strokes merge into the right silhouette and the path stays short. */}
      <g stroke="#0038B8" strokeWidth="1" fill="none">
        <path d="M15 6.6 18.1 12 11.9 12Z" />
        <path d="M15 13.4 11.9 8 18.1 8Z" />
      </g>
    </svg>
  );
}

const FLAGS: Record<Locale, () => React.ReactElement> = {
  en: FlagEn,
  he: FlagHe,
};

export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: Locale) {
    if (locale === active) return;
    startTransition(() => {
      // `pathname` here is already locale-stripped by next-intl, and dynamic
      // segments are still filled in, so it can be replayed as-is under the
      // new locale.
      router.replace(pathname, { locale });
    });
  }

  return (
    <div
      role="group"
      aria-label={t("switch")}
      className="bg-muted inline-flex items-center gap-0.5 rounded-full p-0.5"
    >
      {locales.map((locale) => {
        const Flag = FLAGS[locale];
        const isActive = locale === active;

        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            disabled={isPending}
            aria-pressed={isActive}
            onClick={() => switchTo(locale)}
            className={cn(
              "focus-visible:ring-ring rounded-full p-1 focus-visible:ring-2 focus-visible:outline-none",
              // Not a Button, so it does not inherit the press feedback — and
              // this is the one control in the header that changes the whole
              // page, which is exactly when a tap most wants acknowledging.
              "ease-snap transition-[background-color,opacity,transform] duration-150 active:scale-[0.97]",
              // The unselected flag is dimmed rather than greyed out: a
              // desaturated flag is unrecognisable, which is the one thing a
              // flag is here to do.
              isActive ? "bg-background shadow-sm" : "opacity-55 hover:opacity-100"
            )}
          >
            <span className="block h-3.5 w-5 overflow-hidden rounded-[3px] ring-1 ring-black/20">
              <Flag />
            </span>
            <span className="sr-only">{localeNames[locale]}</span>
          </button>
        );
      })}
    </div>
  );
}
