"use client";

import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";

type MissingFixture = {
  id: string;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
};

export function ParticipantPredictionsDialog({
  user,
  season,
  missingFixtures,
}: {
  user: {
    id: string;
    nickname: string;
    email: string;
    avatarUrl: string | null;
    nicknameConfirmed: boolean;
    groupCount: number;
    predictionCount: number;
    points: number;
    championPicked: boolean;
    topScorerPicked: boolean;
    createdAt: string | null;
  };
  season: number;
  missingFixtures: MissingFixture[];
}) {
  const t = useTranslations("admin.participants");
  const locale = useLocale();

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="focus-visible:ring-ring group -m-1 flex min-w-0 items-center gap-3 rounded-xl p-1 text-start outline-none transition-colors duration-150 hover:bg-white/[0.04] focus-visible:ring-3 active:bg-white/[0.07]"
          aria-label={t("openPredictions", { name: user.nickname })}
        >
          <span className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-white/15">
            <ProfileAvatar
              avatarUrl={user.avatarUrl}
              seed={user.id}
              alt=""
              sizes="44px"
            />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold">{user.nickname}</span>
              <StatusChip
                active={user.nicknameConfirmed}
                activeLabel={t("active")}
                inactiveLabel={t("onboarding")}
              />
            </span>
            <span dir="ltr" className="text-muted-foreground block truncate text-xs">
              {user.email}
            </span>
            <span className="text-muted-foreground mt-1 block text-[0.7rem]">
              {t("meta", {
                groups: user.groupCount,
                predictions: user.predictionCount,
                points: user.points,
              })}
            </span>
            <span className="text-muted-foreground/70 mt-0.5 block text-[0.68rem]">
              {t("joined", { date: formatDate(locale, user.createdAt) })}
            </span>
          </span>
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/65 opacity-100 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-150 data-[state=closed]:opacity-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-popover p-5 text-popover-foreground opacity-100 shadow-2xl outline-none motion-safe:transition-[transform,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-primary/25 shadow-lg">
                <ProfileAvatar
                  avatarUrl={user.avatarUrl}
                  seed={user.id}
                  alt={user.nickname}
                  sizes="64px"
                />
              </span>
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate text-lg font-bold">
                  {t("dialogTitle", { name: user.nickname })}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                  {t("dialogDescription")}
                </DialogPrimitive.Description>
                <p dir="ltr" className="text-muted-foreground mt-1 truncate text-xs">
                  {user.email}
                </p>
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon-sm" title={t("closeDialog")}>
                <X aria-hidden="true" />
                <span className="sr-only">{t("closeDialog")}</span>
              </Button>
            </DialogPrimitive.Close>
          </div>

          <section className="mt-5 rounded-xl border border-white/10 bg-background/30 p-4">
            <h3 className="text-sm font-semibold">
              {t("seasonChoices", { season })}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip
                active={user.championPicked}
                activeLabel={t("championChosen")}
                inactiveLabel={t("championMissing")}
              />
              <StatusChip
                active={user.topScorerPicked}
                activeLabel={t("scorerChosen")}
                inactiveLabel={t("scorerMissing")}
              />
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-white/10 bg-background/30 p-4">
            {missingFixtures.length === 0 ? (
              <p className="text-success text-sm font-medium">
                {t("allMatchesPredicted")}
              </p>
            ) : (
              <>
                <h3 className="text-warning text-sm font-semibold">
                  {t("missingMatches", { count: missingFixtures.length })}
                </h3>
                <ul className="text-muted-foreground mt-3 divide-y divide-white/10 text-sm">
                  {missingFixtures.map((fixture) => (
                    <li key={fixture.id} className="py-2.5 first:pt-0 last:pb-0">
                      <span dir="auto" className="font-medium text-foreground">
                        {fixture.homeTeam} – {fixture.awayTeam}
                      </span>
                      <span className="mt-0.5 block text-xs">
                        {formatDateTime(locale, fixture.kickoffAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function StatusChip({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={
        active
          ? "bg-success/15 text-success rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
          : "bg-warning/15 text-warning rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
      }
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function formatDate(locale: string, value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(value)
  );
}

function formatDateTime(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
