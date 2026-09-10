import { CalendarDays, Mail } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { ProfileAvatarDialog } from "@/components/profile/profile-avatar-dialog";
import { AccountPrivacyActions } from "@/components/profile/account-privacy-actions";
import { ProfileGroupsSection } from "@/components/profile/groups-section";
import { ProfileNicknameDialog } from "@/components/profile/profile-nickname-dialog";
import { ProfileSeasonPicksSection } from "@/components/profile/season-picks-section";
import { SetupNotice } from "@/components/setup-notice";
import { isLocale } from "@/i18n/routing";
import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import { getMyGroups, type GroupView } from "@/lib/groups/queries";
import {
  getPersonalProfileOverview,
} from "@/lib/profile/queries";
import { getRequestTimestamp } from "@/lib/request-time";
import { getUser } from "@/lib/supabase/server";

import styles from "./profile.module.css";

type ProfilePageProps = {
  params: Promise<{ locale: string }>;
};

export default function ProfilePage(props: ProfilePageProps) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  );
}

async function ProfileContent({
  params,
}: ProfilePageProps) {
  const now = await getRequestTimestamp();

  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);

  const user = await getUser();
  if (!user) redirect(`/${locale}/sign-in?next=/${locale}/profile`);

  let overview;

  try {
    overview = await getPersonalProfileOverview(user.id, now);
  } catch (error) {
    if (error instanceof SchemaNotReadyError) {
      return <SetupNotice reason="schema" />;
    }
    throw error;
  }

  const profile = overview.profile;
  if (!profile?.nicknameConfirmedAt) {
    redirect(`/${locale}/onboarding?next=/${locale}/profile`);
  }

  const t = await getTranslations("profile");
  const seasonPoints = overview.seasonPick
    ? overview.seasonPick.championAwardedPoints +
      overview.seasonPick.scorerAwardedPoints
    : 0;
  const joinedAt = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
    dateStyle: "medium",
  }).format(new Date(profile.createdAt));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12">
      <div className={`${styles.panel} mt-5 overflow-hidden rounded-3xl`}>
        <header className={`${styles.hero} px-5 py-5 sm:px-7 sm:py-6`}>
          <div className="relative z-10 grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <ProfileHeroAvatar
                avatarUrl={profile.avatarUrl}
                seed={user.id}
                displayName={profile.displayName}
              />
              <div className="min-w-0">
                <p className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">
                  {t("title")}
                </p>
                <h1 className="mt-1 min-w-0 text-2xl font-semibold tracking-tight sm:text-3xl">
                  <ProfileNicknameDialog
                    displayName={profile.displayName}
                    next={`/${locale}/profile`}
                  />
                </h1>
                <p className="text-muted-foreground mt-1.5 max-w-xl text-sm text-pretty">
                  {t("subtitle")}
                </p>
              </div>
            </div>

            <dl className={`${styles.heroStats} grid grid-cols-3 overflow-hidden rounded-2xl`}>
              <QuickStat label={t("stats.groups")} value={overview.groupCount} />
              <QuickStat
                label={t("stats.predictions")}
                value={overview.predictionCount}
              />
              <QuickStat
                label={t("stats.points")}
                value={overview.matchPoints + seasonPoints}
              />
            </dl>
          </div>
        </header>

        <div className="border-t border-foreground/10 px-5 py-6 sm:px-7 sm:py-7">
          <ProfileSeasonPicksSection
            pick={overview.seasonPick}
            returnTo={`/${locale}/profile#season-picks`}
            locale={locale}
          />
        </div>

        <div className="border-t border-foreground/10 px-5 py-6 sm:px-7 sm:py-7">
          <Suspense fallback={<ProfileGroupsFallback />}>
            <ProfileGroupsContent
              userId={user.id}
              userEmail={user.email}
            />
          </Suspense>
        </div>

        <footer id="account" className="border-t border-foreground/10 px-5 py-4 sm:px-7">
          <dl className="divide-y divide-foreground/8 overflow-hidden rounded-xl border border-foreground/10 bg-white/[0.025]">
            <AccountMetaRow
              icon={<Mail className="size-3.5" aria-hidden="true" />}
              label={t("account.email")}
              value={user.email ?? "—"}
              ltr
            />
            <AccountMetaRow
              icon={<CalendarDays className="size-3.5" aria-hidden="true" />}
              label={t("account.joined")}
              value={joinedAt}
            />
          </dl>
          <AccountPrivacyActions />
        </footer>
      </div>
    </main>
  );
}

async function ProfileGroupsContent({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string | null | undefined;
}) {
  let groups: GroupView[];
  try {
    groups = await getMyGroups(userId, userEmail);
  } catch (error) {
    if (error instanceof SchemaNotReadyError) {
      return <SetupNotice reason="schema" />;
    }
    throw error;
  }
  return <ProfileGroupsSection groups={groups} userId={userId} />;
}

function ProfileGroupsFallback() {
  return (
    <section aria-hidden="true" className="motion-safe:animate-pulse">
      <div className="flex items-center gap-3">
        <span className="bg-muted size-8 rounded-lg" />
        <div className="space-y-2">
          <span className="bg-muted block h-5 w-28 rounded" />
          <span className="bg-muted block h-3 w-52 max-w-full rounded" />
        </div>
      </div>
      <div className="bg-muted/60 mt-4 h-28 rounded-2xl" />
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <main
      aria-hidden="true"
      className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12"
    >
      <div className="mt-5 h-[32rem] animate-pulse rounded-3xl border border-foreground/10 bg-card/55" />
    </main>
  );
}

function ProfileHeroAvatar({
  avatarUrl,
  seed,
  displayName,
}: {
  avatarUrl: string | null;
  seed: string;
  displayName: string;
}) {
  return (
    <div className={styles.heroAvatar}>
      <ProfileAvatarDialog
        avatarUrl={avatarUrl}
        seed={seed}
        displayName={displayName}
        className="size-full overflow-hidden"
      />
      <span className={styles.avatarAccent} aria-hidden="true" />
    </div>
  );
}

function AccountMetaRow({
  icon,
  label,
  value,
  ltr = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-3.5 py-2.5">
      <dt className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="shrink-0">{icon}</span>
        {label}
      </dt>
      <dd
        className="truncate text-end text-xs font-medium sm:text-sm"
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 px-3 py-3.5 text-center sm:min-w-24">
      <dd data-numeric className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
      <dt className="text-muted-foreground mt-0.5 text-[0.68rem]">{label}</dt>
    </div>
  );
}
