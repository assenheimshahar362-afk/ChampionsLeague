"use client";

import { Bot, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { loadLeaderboardPlayerHistory } from "@/lib/leaderboard/actions";
import { AI_PLAYER_ID } from "@/lib/leaderboard/ai-player";
import type { LeaderboardPlayerHistory } from "@/lib/leaderboard/queries";
import { cn } from "@/lib/utils";

type PlayerSummary = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rank: number;
  exact: number;
  correct: number;
  settled: number;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "success"; player: LeaderboardPlayerHistory }
  | { status: "error" };

export function PlayerPredictionHistoryDialog({
  playerSummary,
  isMe,
  selectedGroupId,
  locale,
}: {
  playerSummary: PlayerSummary;
  isMe: boolean;
  selectedGroupId: string | null;
  locale: string;
}) {
  const t = useTranslations("leaderboard");
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const isAi = playerSummary.userId === AI_PLAYER_ID;

  async function loadHistory() {
    setLoadState({ status: "loading" });
    try {
      const result = await loadLeaderboardPlayerHistory(
        playerSummary.userId,
        selectedGroupId
      );
      setLoadState(
        result.ok
          ? { status: "success", player: result.player }
          : { status: "error" }
      );
    } catch {
      setLoadState({ status: "error" });
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && loadState.status === "idle") void loadHistory();
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={t("showPredictions", { player: playerSummary.displayName })}
          className="focus-visible:ring-ring -m-1 flex min-w-0 items-center gap-2 rounded-lg p-1 text-start outline-none transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:ring-2 sm:gap-3"
        >
          <span className="flex w-5 shrink-0 justify-center sm:w-6">
            <span data-numeric className="text-muted-foreground text-xs font-semibold sm:text-sm">
              {playerSummary.rank}
            </span>
          </span>
          <span className="relative size-9 shrink-0 overflow-hidden rounded-full border border-white/15 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] sm:size-10">
            <ProfileAvatar avatarUrl={playerSummary.avatarUrl} seed={playerSummary.userId} alt="" sizes="40px" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-start text-sm font-semibold sm:text-base">
              <bdi>{playerSummary.displayName}</bdi>
              {isMe ? <span className="text-primary ms-1 text-[0.65rem] font-medium sm:ms-1.5 sm:text-xs">{t("you")}</span> : null}
              {isAi ? (
                <span className="text-warning ms-1 inline-flex items-center gap-0.5 text-[0.65rem] font-medium sm:ms-1.5 sm:text-xs">
                  <Bot className="size-3" aria-hidden="true" />
                  {t("ai")}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground mt-0.5 hidden truncate text-[0.65rem] min-[390px]:block sm:text-xs">
              {t("record", { exact: playerSummary.exact, correct: playerSummary.correct, settled: playerSummary.settled })}
            </span>
          </span>
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/65 opacity-100 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-150 data-[state=closed]:opacity-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-popover text-popover-foreground opacity-100 shadow-2xl outline-none motion-safe:transition-[transform,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0">
          <header className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-primary/25 shadow-lg sm:size-20">
                <ProfileAvatar avatarUrl={playerSummary.avatarUrl} seed={playerSummary.userId} alt={playerSummary.displayName} sizes="80px" />
              </span>
              <div className="min-w-0">
                <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-bold sm:text-xl">
                  {isAi ? <Bot className="text-warning size-4 shrink-0" aria-hidden="true" /> : null}
                  <span className="truncate"><bdi>{playerSummary.displayName}</bdi></span>
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

          {loadState.status === "success" ? (
            <HistoryContent player={loadState.player} locale={locale} />
          ) : loadState.status === "error" ? (
            <div className="px-4 py-10 text-center sm:px-5" role="alert">
              <p className="text-destructive text-sm font-medium">{t("historyLoadError")}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={loadHistory}>
                {t("historyRetry")}
              </Button>
            </div>
          ) : (
            <HistoryLoading label={t("historyLoading")} />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function HistoryLoading({ label }: { label: string }) {
  return (
    <div className="px-4 py-5 sm:px-5" role="status" aria-live="polite">
      <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        <LoaderCircle className="text-primary size-4 motion-safe:animate-spin" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-4 space-y-3" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-xl border border-white/10 p-3">
            <div className="bg-muted h-3 w-2/3 animate-pulse rounded motion-reduce:animate-none" />
            <div className="bg-muted mt-2 h-2.5 w-1/3 animate-pulse rounded motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryContent({ player, locale }: { player: LeaderboardPlayerHistory; locale: string }) {
  const t = useTranslations("leaderboard");

  if (player.predictions.length === 0) {
    return <p className="text-muted-foreground px-4 py-10 text-center text-sm">{t("historyEmpty")}</p>;
  }

  return (
    <div className="divide-y divide-white/10">
      {player.predictions.map((prediction) => (
        <Link key={prediction.fixtureId} href={`/matches/${prediction.fixtureId}`} className="grid gap-3 px-4 py-3.5 outline-none transition-colors duration-150 hover:bg-white/[0.035] focus-visible:bg-white/[0.055] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:px-5">
          <span className="min-w-0">
            <span dir="auto" className="block truncate text-sm font-medium">{prediction.homeTeam} {t("versus")} {prediction.awayTeam}</span>
            <span className="text-muted-foreground mt-0.5 block text-xs">{formatDateTime(locale, prediction.kickoffAt)}</span>
          </span>
          <HistoryValue label={t("prediction")} value={`${prediction.predictedHomeGoals}:${prediction.predictedAwayGoals}`} />
          <HistoryValue label={t("result")} value={prediction.actualHomeGoals === null || prediction.actualAwayGoals === null ? t("awaitingResult") : `${prediction.actualHomeGoals}:${prediction.actualAwayGoals}`} />
          <HistoryValue label={t("points")} value={prediction.points ?? "—"} emphasis />
        </Link>
      ))}
    </div>
  );
}

function HistoryValue({ label, value, emphasis = false }: { label: string; value: string | number; emphasis?: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-3 sm:block sm:min-w-20 sm:text-center">
      <span className="text-muted-foreground text-[0.65rem]">{label}</span>
      <span data-numeric dir={typeof value === "string" && /^\d+:\d+$/.test(value) ? "ltr" : undefined} className={cn("ms-2 text-sm font-semibold tabular-nums sm:ms-0 sm:mt-0.5 sm:block", emphasis && "text-primary")}>{value}</span>
    </span>
  );
}

function formatDateTime(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
