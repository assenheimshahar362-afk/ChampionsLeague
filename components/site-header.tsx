import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/actions";
import { isAdminEmail } from "@/lib/admin/auth";
import { getNavigationProfile } from "@/lib/profile/queries";
import { getUser } from "@/lib/supabase/server";

export async function SiteHeader() {
  const t = await getTranslations();

  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          {/* Empty alt: the wordmark beside it already gives the link its
              accessible name, so describing the mark too would have a screen
              reader announce the app twice. */}
          <Image
            src="/logo.webp"
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0"
          />
          {t("app.name")}
        </Link>

        {/* Hidden on phones: the same routes live in the bottom tab bar there,
            and repeating them here would be two navigations for one app. */}
        <nav aria-label={t("nav.label")} className="hidden items-center md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/leaderboard">{t("nav.table")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/standings">{t("nav.standings")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/rules">{t("nav.rules")}</Link>
          </Button>
        </nav>

        {/* Logical margin: flips correctly under RTL without a second rule. */}
        <div className="ms-auto flex items-center gap-2">
          <Suspense fallback={<span className="bg-muted h-8 w-24 animate-pulse rounded-md" />}>
            <LocaleSwitcher />
          </Suspense>
          <Suspense fallback={<span className="bg-muted h-8 w-20 animate-pulse rounded-md" />}>
            <HeaderAccount
              adminLabel={t("admin.navLink")}
              profileLabel={t("profile.navLink")}
              signInLabel={t("auth.signIn")}
              signOutLabel={t("common.signOut")}
            />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function HeaderAccount({
  adminLabel,
  profileLabel,
  signInLabel,
  signOutLabel,
}: {
  adminLabel: string;
  profileLabel: string;
  signInLabel: string;
  signOutLabel: string;
}) {
  const user = await getUser();
  const profile = user ? await getNavigationProfile(user.id) : null;

  if (!user) {
    return (
      <Button asChild size="sm">
        <Link href="/sign-in">{signInLabel}</Link>
      </Button>
    );
  }

  return (
    <>
      {isAdminEmail(user.email) ? (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-7 px-0 md:w-auto md:px-2.5"
        >
          <Link href="/admin" aria-label={adminLabel} title={adminLabel}>
            <ShieldCheck className="size-4 md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">{adminLabel}</span>
          </Link>
        </Button>
      ) : null}
      <Link
        href="/profile"
        aria-label={profileLabel}
        title={profileLabel}
        className="focus-visible:ring-ring relative flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-150 ease-snap outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span
          aria-hidden="true"
          className="bg-primary/20 absolute -inset-1 rounded-full opacity-40 blur-md"
        />
        <span className="bg-surface relative flex size-8 items-center justify-center overflow-hidden rounded-full border border-white/25 shadow-[0_6px_18px_rgb(2_6_24/0.3),inset_0_1px_0_rgb(255_255_255/0.12)]">
          <ProfileAvatar
            avatarUrl={profile?.avatarUrl}
            seed={user.id}
            alt=""
            sizes="32px"
          />
        </span>
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          {signOutLabel}
        </Button>
      </form>
    </>
  );
}
