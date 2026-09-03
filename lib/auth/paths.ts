import { defaultLocale, locales, type Locale } from "@/i18n/routing";

export function safeRelativePath(value: string | undefined, fallback = "/"): string {
  if (!value?.startsWith("/")) return fallback;

  try {
    const origin = "http://app.local";
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function localeFromPath(path: string): Locale {
  const segment = path.split("/")[1];
  return (locales as readonly string[]).includes(segment)
    ? (segment as Locale)
    : defaultLocale;
}

/** Routes a fresh session through the required season-pick screen. */
export function seasonPickOnboardingPath(next: string): string {
  const safeNext = safeRelativePath(next);
  const locale = localeFromPath(safeNext);
  const pathname = safeNext.split("?")[0];

  if (pathname === `/${locale}/onboarding`) return safeNext;

  return `/${locale}/onboarding?next=${encodeURIComponent(safeNext)}`;
}
