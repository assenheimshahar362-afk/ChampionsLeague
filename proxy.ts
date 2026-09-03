import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const handleI18n = createIntlMiddleware(routing);

/**
 * Routes that require a signed-in user. Matched against the path with the
 * locale prefix already stripped.
 */
const PROTECTED_PREFIXES = [
  "/groups",
  "/profile",
  "/onboarding",
  "/admin",
  // A user's own score history. The page redirects on its own too — this is
  // the first of the three layers (§11), not the only one.
  "/predictions",
];

function stripLocale(pathname: string): string {
  const segments = pathname.split("/");
  const maybeLocale = segments[1];
  if (maybeLocale && (routing.locales as readonly string[]).includes(maybeLocale)) {
    return "/" + segments.slice(2).join("/");
  }
  return pathname;
}

function redirectWithSessionCookies(url: URL, source: NextResponse) {
  const target = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export async function proxy(request: NextRequest) {
  // next-intl decides the locale and owns the response object. Supabase then
  // writes refreshed auth cookies onto that same response — see updateSession.
  const response = handleI18n(request);

  const { user } = await updateSession(request, response);

  const path = stripLocale(request.nextUrl.pathname);
  const locale = request.nextUrl.pathname.split("/")[1] || routing.defaultLocale;

  const needsAuth = PROTECTED_PREFIXES.some(
    (prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix)
  );

  if (needsAuth && !user) {
    const signIn = new URL(`/${locale}/sign-in`, request.url);
    // Preserve where they were headed so an invite link survives the detour.
    signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);

    // Carry over any cookies the session refresh just set, or the redirect
    // lands the user back on sign-in in a loop.
    return redirectWithSessionCookies(signIn, response);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - /api and /auth  (route handlers: no locale prefix, no intl rewrite)
     *  - /_next/*        (framework internals)
     *  - static assets by extension
     */
    "/((?!api|auth|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)",
  ],
};
