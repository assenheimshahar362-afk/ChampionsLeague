import { ArrowDown, ArrowRight } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";

/**
 * Home hero.
 *
 * A permanent brand statement rather than a matchday status panel. Nothing in
 * this copy depends on ingestion, the current round, or the user's fixture
 * state, so the app always introduces itself with the same clear promise.
 */
export async function Hero() {
  const [t, app] = await Promise.all([
    getTranslations("hero"),
    getTranslations("app"),
  ]);

  return (
    <section className="bg-surface/55 relative isolate overflow-hidden rounded-3xl border border-white/15 text-white shadow-[0_30px_90px_rgb(2_7_28/0.42),inset_0_1px_0_rgb(255_255_255/0.08)] backdrop-blur-xl sm:rounded-[2rem]">
      <div
        aria-hidden="true"
        className="from-background/90 via-surface/65 to-primary/20 absolute inset-0 -z-20 bg-gradient-to-br"
      />
      <div
        aria-hidden="true"
        className="bg-floodlight/20 absolute -top-24 start-1/4 -z-10 size-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-primary/20 absolute -end-20 -bottom-28 -z-10 size-80 rounded-full blur-3xl"
      />

      {/* Quiet pitch geometry gives the artwork structure without competing
          with the copy or relying on another image download. */}
      <div
        aria-hidden="true"
        className="absolute -end-28 top-1/2 -z-10 size-80 -translate-y-1/2 rounded-full border border-white/[0.07] sm:size-[30rem] lg:-end-36 lg:size-[38rem]"
      >
        <span className="absolute inset-[19%] rounded-full border border-white/[0.06]" />
        <span className="absolute inset-y-0 start-1/2 border-s border-white/[0.06]" />
      </div>

      <div className="relative grid min-h-[18rem] gap-5 px-5 py-5 sm:min-h-[25rem] sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center sm:gap-8 sm:px-8 sm:py-10 lg:min-h-[29rem] lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-14 lg:px-12 lg:py-12">
        <div className="relative z-10">
          <h1 className="max-w-2xl tracking-tight text-balance">
            <span className="block text-4xl leading-none font-bold sm:text-6xl lg:text-7xl">
              {app("name")}
            </span>
            <span className="mt-3 block max-w-[18rem] text-base leading-snug font-semibold text-white/95 sm:mt-4 sm:max-w-none sm:text-xl lg:max-w-2xl lg:text-2xl">
              {t("subheading")}
            </span>
          </h1>

          <div className="mt-5 flex flex-wrap gap-2.5 sm:mt-6">
            <Suspense fallback={<span className="bg-primary/70 h-10 w-36 animate-pulse rounded-md" />}>
              <HeroPrimaryAction
                signedInLabel={t("ctaSignedIn")}
                signedOutLabel={t("cta")}
              />
            </Suspense>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/15 bg-white/[0.05] text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/rules">{t("secondaryCta")}</Link>
            </Button>
          </div>
        </div>

        {/* On phones the mark becomes atmospheric artwork; from tablet up it
            turns into the visual counterweight to the copy. */}
        <div className="pointer-events-none absolute -end-7 -top-7 size-36 opacity-15 sm:relative sm:end-auto sm:top-auto sm:size-52 sm:opacity-100 lg:size-64">
          <span
            aria-hidden="true"
            className="border-floodlight/20 bg-primary/[0.06] absolute -inset-4 rotate-6 rounded-[2.5rem] border"
          />
          <span className="bg-background/45 relative block size-full overflow-hidden rounded-[2rem] border border-white/20 p-2 shadow-[0_24px_55px_rgb(3_7_25/0.5),0_0_42px_rgb(69_155_255/0.18)] backdrop-blur-xl">
            <Image
              src="/logo.webp"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 256px, (min-width: 640px) 208px, 176px"
              className="object-cover p-2"
            />
          </span>
        </div>
      </div>
    </section>
  );
}

async function HeroPrimaryAction({
  signedInLabel,
  signedOutLabel,
}: {
  signedInLabel: string;
  signedOutLabel: string;
}) {
  const user = await getUser();
  return (
    <Button asChild size="lg">
      {user ? (
        <a href="#matches">
          {signedInLabel}
          <ArrowDown className="size-4" aria-hidden="true" />
        </a>
      ) : (
        <Link href="/sign-in">
          {signedOutLabel}
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      )}
    </Button>
  );
}
