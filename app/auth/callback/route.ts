import { NextResponse, type NextRequest } from "next/server";

import { defaultLocale } from "@/i18n/routing";
import { getPublicOrigin } from "@/lib/auth/origin";
import { seasonPickOnboardingPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_VERSION } from "@/lib/legal/version";

/**
 * OAuth + email-confirmation landing point.
 *
 * Both flows are PKCE under @supabase/ssr, so both arrive here with a `code`
 * to exchange for a session — Google consent and the link in a signup
 * confirmation email land on the same handler.
 *
 * Deliberately outside the [locale] segment and excluded from the i18n
 * middleware matcher — the provider redirect URL must stay a single stable
 * string in the Supabase dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = getPublicOrigin(request.nextUrl.origin);

  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  // Supabase reports provider-side failures (user cancelled, config error)
  // as query params rather than an exception.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  // Only relative same-origin paths, matching the check in the sign-in action.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const failure = new URL(`/${defaultLocale}/sign-in`, origin);
  failure.searchParams.set("error", "exchangeFailed");

  if (providerError) {
    console.error("auth callback: provider returned an error", providerError);
    return NextResponse.redirect(failure);
  }

  if (!code) {
    return NextResponse.redirect(failure);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("auth callback: code exchange failed", error.message);
    return NextResponse.redirect(failure);
  }

  if (searchParams.get("legal") === LEGAL_VERSION) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: consentError } = await supabase
        .from("profiles")
        .update({
          accepted_terms_at: new Date().toISOString(),
          accepted_terms_version: LEGAL_VERSION,
        })
        .eq("id", user.id);
      if (consentError) console.error("Saving legal consent failed", consentError.message);
    }
  }

  // The profile row is created by the on_auth_user_created trigger, so there
  // is nothing to provision here — the user can be sent straight on.
  return NextResponse.redirect(
    new URL(seasonPickOnboardingPath(safeNext), origin)
  );
}
