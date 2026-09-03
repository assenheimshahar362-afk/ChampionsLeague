import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";

export async function SiteFooter() {
  const t = await getTranslations();

  return (
    <footer className="relative isolate mt-auto overflow-hidden border-t border-white/15 bg-surface/55 text-white backdrop-blur-xl">
      <div
        aria-hidden="true"
        className="from-background/90 via-surface/65 to-primary/20 absolute inset-0 -z-20 bg-gradient-to-br"
      />
      <div
        aria-hidden="true"
        className="bg-floodlight/20 absolute -top-36 start-1/4 -z-10 size-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-primary/20 absolute -end-24 -bottom-44 -z-10 size-80 rounded-full blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-5xl px-4 py-7 sm:py-8">
        <div className="flex flex-col items-center text-center">
          <span className="relative flex size-14 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.32),inset_0_1px_0_rgb(255_255_255/0.1)]">
            <Image
              src="/logo.webp"
              alt=""
              width={44}
              height={44}
              className="size-full rounded-xl object-cover"
            />
          </span>

          <div className="mt-3 flex items-center justify-center gap-2.5">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            <p className="text-base font-bold tracking-tight">{t("app.name")}</p>
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          </div>

          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/65 text-pretty">
            {t("app.tagline")}
          </p>
        </div>

        <div className="mt-6 border-y border-white/10 py-3">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <nav aria-label={t("footer.navLabel")}>
              <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-white/65">
                <li>
                  <Link href="/" className="transition-colors duration-150 hover:text-white">
                    {t("footer.linkMatches")}
                  </Link>
                </li>
                <li>
                  <Link href="/leaderboard" className="transition-colors duration-150 hover:text-white">
                    {t("nav.table")}
                  </Link>
                </li>
                <li>
                  <Link href="/standings" className="transition-colors duration-150 hover:text-white">
                    {t("nav.standings")}
                  </Link>
                </li>
                <li>
                  <Link href="/rules" className="transition-colors duration-150 hover:text-white">
                    {t("nav.rules")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/accessibility"
                    className="transition-colors duration-150 hover:text-white"
                  >
                    {t("footer.accessibility")}
                  </Link>
                </li>
                <Suspense fallback={null}>
                  <FooterAccountLink
                    profileLabel={t("footer.linkProfile")}
                    signInLabel={t("auth.signIn")}
                  />
                </Suspense>
              </ul>
            </nav>

            <span className="hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />
            <Suspense fallback={<span className="h-8 w-24 animate-pulse rounded-full bg-white/10" />}>
              <LocaleSwitcher />
            </Suspense>
          </div>
        </div>

        <p
          dir="ltr"
          className="mt-4 text-center text-xs text-white/60"
        >
          © 2026 SA Software Solutions
        </p>
      </div>
    </footer>
  );
}

async function FooterAccountLink({
  profileLabel,
  signInLabel,
}: {
  profileLabel: string;
  signInLabel: string;
}) {
  const user = await getUser();
  return (
    <li>
      <Link
        href={user ? "/profile" : "/sign-in"}
        className="transition-colors duration-150 hover:text-white"
      >
        {user ? profileLabel : signInLabel}
      </Link>
    </li>
  );
}
