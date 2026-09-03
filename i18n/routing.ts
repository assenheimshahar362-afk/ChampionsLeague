import { defineRouting } from "next-intl/routing";

export const locales = ["en", "he"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Text direction per locale. Drives <html dir> and the RTL styling pass. */
export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  he: "rtl",
};

/** Native names, for the locale switcher. Never translate these. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  he: "עברית",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Always prefix, including the default locale, so a URL is unambiguous when
  // it is pasted into a group chat — the single most common way a link travels
  // in this app.
  localePrefix: "always",
  localeDetection: true,
});

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
