import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
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
  return { title: t("signUp") };
}

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);

  const { next } = await searchParams;

  // Already signed in: an account is exactly what they have, so send them on
  // rather than offering to create a second one.
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
      <FormSurface className="w-full max-w-md p-5 sm:p-7">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {t("signUpHeading")}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            {t("signUpSubheading")}
          </p>
        </header>

        <div className="mt-7">
          <SignUpForm
            next={next && next.startsWith("/") ? next : `/${locale}/profile`}
          />
        </div>
      </FormSurface>
    </main>
  );
}
