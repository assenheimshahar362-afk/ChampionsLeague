"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import { getPublicOrigin } from "@/lib/auth/origin";
import { seasonPickOnboardingPath } from "@/lib/auth/paths";
import { LEGAL_VERSION } from "@/lib/legal/version";
import { createClient } from "@/lib/supabase/server";

/**
 * Error codes, not sentences. The client resolves these through next-intl so
 * the message arrives in the user's language (§9).
 */
export type SignInErrorCode =
  | "invalidEmail"
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "rateLimited"
  | "generic";

export type SignInState =
  | { status: "idle" }
  | { status: "error"; code: SignInErrorCode };

export type SignUpErrorCode =
  | "invalidEmail"
  | "weakPassword"
  | "termsRequired"
  | "emailTaken"
  | "rateLimited"
  | "generic";

export type SignUpState =
  | { status: "idle" }
  | { status: "confirm"; email: string }
  | { status: "error"; code: SignUpErrorCode };

/**
 * Absolute origin for OAuth and email-confirmation redirects.
 *
 * Request host headers are accepted only for a loopback development server.
 * Production uses an application-controlled URL so a forged Host header cannot
 * redirect an OAuth code or an email-confirmation token to an attacker.
 */
async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return getPublicOrigin();

  const isLoopback =
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host.startsWith("127.0.0.1:") ||
    host === "[::1]" ||
    host.startsWith("[::1]:");
  const proto = h.get("x-forwarded-proto") ?? (isLoopback ? "http" : "https");

  return getPublicOrigin(`${proto}://${host}`);
}

/**
 * `next` arrives from a query string, so it is attacker-controlled. Only
 * same-origin relative paths are allowed through — otherwise a crafted invite
 * link could bounce a freshly authenticated user to another site.
 */
const nextPathSchema = z
  .string()
  .refine((v) => v.startsWith("/") && !v.startsWith("//"), {
    message: "must be a relative path",
  });

function safeNext(value: FormDataEntryValue | null): string {
  const parsed = nextPathSchema.safeParse(typeof value === "string" ? value : "");
  return parsed.success ? parsed.data : "/";
}

const emailSchema = z.email();

/** Email + password sign-in. */
export async function signInWithPassword(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!emailSchema.safeParse(email).success) {
    return { status: "error", code: "invalidEmail" };
  }
  // Never send an empty password to the auth server: it costs a round trip to
  // be told what the form already knows.
  if (!password) return { status: "error", code: "invalidCredentials" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { status: "error", code: "emailNotConfirmed" };
    }
    // Wrong password and unknown address collapse into one message on purpose:
    // telling them apart turns the form into an account-existence oracle.
    if (error.code === "invalid_credentials") {
      return { status: "error", code: "invalidCredentials" };
    }
    if (error.status === 429) return { status: "error", code: "rateLimited" };
    console.error("signInWithPassword failed", error.message);
    return { status: "error", code: "generic" };
  }

  // Outside any try/catch: redirect() signals by throwing.
  redirect(seasonPickOnboardingPath(next));
}

/** Email + password sign-up. */
export async function signUpWithPassword(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const acceptedTerms = formData.get("terms") === "on";
  const next = safeNext(formData.get("next"));

  if (!emailSchema.safeParse(email).success) {
    return { status: "error", code: "invalidEmail" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { status: "error", code: "weakPassword" };
  }
  // Checked on the server as well as in the markup: the checkbox is only a
  // hint, and this action is reachable by direct POST (§11).
  if (!acceptedTerms) return { status: "error", code: "termsRequired" };

  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      data: { accepted_terms_version: LEGAL_VERSION },
    },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return { status: "error", code: "emailTaken" };
    }
    if (error.code === "weak_password") {
      return { status: "error", code: "weakPassword" };
    }
    if (error.status === 429) return { status: "error", code: "rateLimited" };
    console.error("signUpWithPassword failed", error.message);
    return { status: "error", code: "generic" };
  }

  // With user-enumeration protection on, signing up an address that already
  // exists succeeds and returns a decoy user carrying no identities. Treating
  // it as taken would leak exactly what that protection hides, so it gets the
  // same "check your inbox" screen as a real signup — the mail Supabase sends
  // that address is a sign-in notice, not a confirmation.
  if (!data.session) return { status: "confirm", email };

  // Only reachable with "Confirm email" turned off, which the project does not
  // use — but if it is ever flipped, land the user in the app rather than on a
  // screen telling them to check an inbox that will stay empty.
  redirect(seasonPickOnboardingPath(next));
}

/** Google OAuth. Redirects the browser to Google's consent screen. */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));

  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      // Without this Google signs the browser's single active session straight
      // in, with no chooser — which silently picks the wrong account for anyone
      // holding a personal and a work login at once, and gives no visible way
      // to switch. Supabase forwards the param to Google verbatim.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    console.error("signInWithGoogle failed", error?.message);
    redirect(`/sign-in?error=generic`);
  }

  redirect(data.url);
}

export async function signUpWithGoogle(formData: FormData): Promise<void> {
  if (formData.get("terms") !== "on") redirect("/sign-up?error=termsRequired");

  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const origin = await getOrigin();
  const callback = `${origin}/auth/callback?next=${encodeURIComponent(next)}&legal=${LEGAL_VERSION}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    console.error("signUpWithGoogle failed", error?.message);
    redirect("/sign-up?error=generic");
  }
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
