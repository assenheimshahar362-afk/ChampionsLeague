import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SetupNotice } from "@/components/setup-notice";
import { isLocale } from "@/i18n/routing";
import { safeRelativePath } from "@/lib/auth/paths";
import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import { getRequestTimestamp } from "@/lib/request-time";
import { getSeasonPickSetup } from "@/lib/season-picks/queries";
import { createClient, getUser } from "@/lib/supabase/server";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return { title: t("heading") };
}

type OnboardingPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; edit?: string }>;
};

export default function OnboardingPage(props: OnboardingPageProps) {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <OnboardingContent {...props} />
    </Suspense>
  );
}

async function OnboardingContent({
  params,
  searchParams,
}: OnboardingPageProps) {
  const now = await getRequestTimestamp();

  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);

  const query = await searchParams;
  const next = safeRelativePath(query.next, `/${locale}`);
  const user = await getUser();
  if (!user) {
    redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/onboarding?next=${encodeURIComponent(next)}`)}`);
  }

  const db = await createClient();
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("display_name, nickname_confirmed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    if (profileError.code === "PGRST205" || profileError.code === "42703") {
      return <SetupNotice reason="schema" />;
    }
    throw new Error(`Loading profile onboarding failed: ${profileError.message}`);
  }

  let setup;
  try {
    setup = await getSeasonPickSetup(user.id, now);
  } catch (error) {
    if (error instanceof SchemaNotReadyError) return <SetupNotice reason="schema" />;
    throw error;
  }

  if (!setup || setup.teams.length === 0 || setup.players.length === 0) {
    return <SetupNotice reason="empty" />;
  }
  const completed = Boolean(profile?.nickname_confirmed_at && setup.completed);
  const editing = query.edit === "1";
  if (completed && (!editing || setup.locked)) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-8 pb-16 sm:py-12">
      <OnboardingWizard
        season={setup.season}
        teams={setup.teams}
        players={setup.players}
        initialNickname={
          profile?.nickname_confirmed_at ? profile.display_name : undefined
        }
        initialChampionCandidateId={setup.existingPick?.championCandidateId}
        initialTopScorerCandidateId={setup.existingPick?.topScorerCandidateId}
        initialStep={completed ? 2 : 1}
        next={next}
      />
    </main>
  );
}

function OnboardingSkeleton() {
  return (
    <main
      aria-hidden="true"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-8 pb-16 sm:py-12"
    >
      <div className="w-full rounded-2xl border border-white/15 bg-card/55 p-5 backdrop-blur-xl sm:p-7">
        <div className="mx-auto h-3 w-36 animate-pulse rounded-full bg-primary/20" />
        <div className="mx-auto mt-4 h-8 w-64 max-w-full animate-pulse rounded-lg bg-white/10" />
        <div className="mx-auto mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-white/[0.07]" />
        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-4 gap-5">
          {["one", "two", "three", "four"].map((item) => (
            <div key={item} className="mx-auto size-8 animate-pulse rounded-full bg-white/[0.08]" />
          ))}
        </div>
        <div className="mx-auto mt-8 h-56 max-w-2xl animate-pulse rounded-xl bg-white/[0.05]" />
        <div className="mx-auto mt-6 h-10 max-w-2xl animate-pulse rounded-lg bg-white/[0.07]" />
      </div>
    </main>
  );
}
