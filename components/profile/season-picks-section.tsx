import { CheckCircle2, LockKeyhole, Pencil, Target, Trophy, UserRound } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { SeasonPickOverview } from "@/lib/profile/queries";

function seasonLabel(season: number): string {
  return `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
}

export async function ProfileSeasonPicksSection({
  pick,
  returnTo,
  locale,
}: {
  pick: SeasonPickOverview | null;
  returnTo: string;
  locale: string;
}) {
  const t = await getTranslations("profile.seasonPicks");

  return (
    <section id="season-picks" className="scroll-mt-20">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15">
          <Trophy className="size-4.5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-muted-foreground mt-0.5 text-sm text-pretty">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {!pick ? (
        <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.035] p-4 text-center">
          <Target className="text-primary mx-auto size-7" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">{t("empty")}</p>
          <Button asChild className="mt-4">
            <Link href={`/onboarding?next=${encodeURIComponent(returnTo)}`}>
              {t("choose")}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.035] p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/10 pb-3">
            <p className="text-sm font-semibold">
              {t("season", { season: seasonLabel(pick.season) })}
            </p>
            <div className="flex items-center gap-3">
              <span
                className={
                  pick.settledAt
                    ? "text-success flex items-center gap-1.5 text-xs font-medium"
                    : "text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
                }
              >
                {pick.settledAt ? (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                ) : pick.locked ? (
                  <LockKeyhole className="size-3.5" aria-hidden="true" />
                ) : (
                  <Pencil className="size-3.5" aria-hidden="true" />
                )}
                {pick.settledAt
                  ? t("settled")
                  : pick.locked
                    ? t("locked")
                    : t("editable")}
              </span>
              {!pick.locked && !pick.settledAt ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/onboarding?edit=1&next=${encodeURIComponent(returnTo)}`}>
                    {t("edit")}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <article className="rounded-lg border border-foreground/10 bg-white/[0.06] p-3">
              <p className="text-muted-foreground text-xs font-medium">
                {t("champion")}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span className="bg-muted relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-foreground/10">
                  {pick.champion.logoUrl ? (
                    <Image src={pick.champion.logoUrl} alt="" fill sizes="44px" className="object-contain p-1" unoptimized />
                  ) : (
                    <Trophy className="text-muted-foreground size-5" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {locale === "he" ? pick.champion.nameHe : pick.champion.nameEn}
                  </p>
                  <Points
                    settled={Boolean(pick.settledAt)}
                    potential={pick.championPotentialPoints}
                    awarded={pick.championAwardedPoints}
                    potentialLabel={t("potentialPoints")}
                    awardedLabel={t("awardedPoints")}
                  />
                </div>
              </div>
            </article>

            <article className="rounded-lg border border-foreground/10 bg-white/[0.06] p-3">
              <p className="text-muted-foreground text-xs font-medium">
                {t("topScorer")}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span className="bg-muted relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-foreground/10">
                  {pick.topScorer.photoUrl ? (
                    <Image
                      src={pick.topScorer.photoUrl}
                      alt=""
                      fill
                      sizes="44px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <UserRound
                      className="text-muted-foreground size-5"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {locale === "he" ? pick.topScorer.nameHe : pick.topScorer.nameEn}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {locale === "he" ? pick.topScorer.teamNameHe : pick.topScorer.teamNameEn}
                  </p>
                  <Points
                    settled={Boolean(pick.settledAt)}
                    potential={pick.scorerPotentialPoints}
                    awarded={pick.scorerAwardedPoints}
                    potentialLabel={t("potentialPoints")}
                    awardedLabel={t("awardedPoints")}
                  />
                </div>
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}

function Points({
  settled,
  potential,
  awarded,
  potentialLabel,
  awardedLabel,
}: {
  settled: boolean;
  potential: number;
  awarded: number;
  potentialLabel: string;
  awardedLabel: string;
}) {
  return (
    <p
      className={
        settled && awarded > 0
          ? "text-success mt-1 text-xs font-medium"
          : "text-muted-foreground mt-1 text-xs"
      }
    >
      {settled ? awardedLabel : potentialLabel}: {settled ? awarded : potential}
    </p>
  );
}
