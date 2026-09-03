import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { FormSurface } from "@/components/ui/form-surface";
import { isLocale } from "@/i18n/routing";
import { seasonPickOnboardingPath } from "@/lib/auth/paths";
import { getUser } from "@/lib/supabase/server";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signIn") };
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);

  const { next, error } = await searchParams;

  // Already signed in: skip the screen entirely rather than showing a form
  // that would bounce them straight back.
  const user = await getUser();
  if (user) {
    redirect(
      seasonPickOnboardingPath(
        next && next.startsWith("/") ? next : `/${locale}/profile`
      )
    );
  }

  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <FormSurface className="p-5 sm:p-7">
          <header className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {t("signInHeading")}
            </h1>
            <p className="text-muted-foreground text-sm text-pretty">
              {t("signInSubheading")}
            </p>
          </header>

          <div className="mt-7">
            <SignInForm
              next={next && next.startsWith("/") ? next : `/${locale}/profile`}
              initialError={error}
            />
          </div>
        </FormSurface>

        <p className="text-muted-foreground/80 text-center text-xs text-balance">
          {t("legal")}
        </p>
      </div>
    </main>
  );
}
