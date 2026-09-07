"use client";

import { Bot, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import type { LeaderboardPlayerHistory } from "@/lib/leaderboard/queries";
import { cn } from "@/lib/utils";

export function PlayerPredictionHistoryDialog({
  player,
  selectedGroupId,
  locale,
}: {
  player: LeaderboardPlayerHistory;
  selectedGroupId: string | null;
  locale: string;
}) {
  const t = useTranslations("leaderboard");
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      router.replace(
        selectedGroupId
          ? { pathname: "/leaderboard", query: { group: selectedGroupId } }
          : "/leaderboard"
      );
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/65 opacity-100 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-150 data-[state=closed]:opacity-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-popover text-popover-foreground opacity-100 shadow-2xl outline-none motion-safe:transition-[transform,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0">
          <header className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-primary/25 shadow-lg sm:size-20">
                <ProfileAvatar
                  avatarUrl={player.avatarUrl}
                  seed={player.userId}
                  alt={player.displayName}
                  sizes="80px"
                />
              </span>
              <div className="min-w-0">
                <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-bold sm:text-xl">
                  {player.isAi ? (
                    <Bot className="text-warning size-4 shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className="truncate"><bdi>{player.displayName}</bdi></span>
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                  {t("historySubtitle")}
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" size="icon-sm" variant="ghost" title={t("closeHistory")}>
                <X aria-hidden="true" />
                <span className="sr-only">{t("closeHistory")}</span>
              </Button>
            </DialogPrimitive.Close>
          </header>

          {player.predictions.length === 0 ? (
            <p className="text-muted-foreground px-4 py-10 text-center text-sm">
              {t("historyEmpty")}
            </p>
          ) : (
            <div className="divide-y divide-white/10">
              {player.predictions.map((prediction) => (
                <Link
                  key={prediction.fixtureId}
                  href={`/matches/${prediction.fixtureId}`}
                  className="grid gap-3 px-4 py-3.5 outline-none transition-colors duration-150 hover:bg-white/[0.035] focus-visible:bg-white/[0.055] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:px-5"
                >
                  <span className="min-w-0">
                    <span dir="auto" className="block truncate text-sm font-medium">
                      {prediction.homeTeam} {t("versus")} {prediction.awayTeam}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {formatDateTime(locale, prediction.kickoffAt)}
                    </span>
                  </span>
                  <HistoryValue
                    label={t("prediction")}
                    value={`${prediction.predictedHomeGoals}:${prediction.predictedAwayGoals}`}
                  />
                  <HistoryValue
                    label={t("result")}
                    value={
                      prediction.actualHomeGoals === null ||
                      prediction.actualAwayGoals === null
                        ? t("awaitingResult")
                        : `${prediction.actualHomeGoals}:${prediction.actualAwayGoals}`
                    }
                  />
                  <HistoryValue
                    label={t("points")}
                    value={prediction.points ?? "—"}
                    emphasis
                  />
                </Link>
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function HistoryValue({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string | number;
  emphasis?: boolean;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3 sm:block sm:min-w-20 sm:text-center">
      <span className="text-muted-foreground text-[0.65rem]">{label}</span>
      <span
        data-numeric
        dir={typeof value === "string" && /^\d+:\d+$/.test(value) ? "ltr" : undefined}
        className={cn(
          "ms-2 text-sm font-semibold tabular-nums sm:ms-0 sm:mt-0.5 sm:block",
          emphasis && "text-primary"
        )}
      >
        {value}
      </span>
    </span>
  );
}

function formatDateTime(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
