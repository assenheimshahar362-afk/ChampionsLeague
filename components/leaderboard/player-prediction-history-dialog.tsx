"use client";

import { Bot, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { loadLeaderboardPlayerHistory } from "@/lib/leaderboard/actions";
import { AI_PLAYER_ID } from "@/lib/leaderboard/ai-player";
import type {
  LeaderboardPrediction,
  LeaderboardPlayerHistory,
  LeaderboardTeam,
} from "@/lib/leaderboard/queries";
import { cn } from "@/lib/utils";

type PlayerSummary = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rank: number;
  exact: number;
  correct: number;
  settled: number;
  points: number;
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
  const directionCount = Math.max(
    0,
    playerSummary.correct - playerSummary.exact
  );
  const wrongCount = Math.max(
    0,
    playerSummary.settled - playerSummary.correct
  );

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
            <span className="text-muted-foreground mt-0.5 hidden truncate text-xs sm:block">
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
                <DialogPrimitive.Title className="flex min-w-0 items-center gap-2 text-lg font-bold sm:text-xl">
                  {isAi ? <Bot className="text-warning size-4 shrink-0" aria-hidden="true" /> : null}
                  <span className="truncate"><bdi>{playerSummary.displayName}</bdi></span>
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground shrink-0 font-normal"
                  >
                    –
                  </span>
                  <span
                    data-numeric
                    title={t("totalPoints", { points: playerSummary.points })}
                    aria-label={t("totalPoints", { points: playerSummary.points })}
                    className="text-primary shrink-0 font-extrabold tabular-nums"
                  >
                    {playerSummary.points}
                  </span>
                </DialogPrimitive.Title>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[0.65rem] font-semibold sm:text-xs">
                  <span className="text-success">
                    {t("exactCount", { count: playerSummary.exact })}
                  </span>
                  <span className="text-warning">
                    {t("directionCount", { count: directionCount })}
                  </span>
                  <span className="text-destructive">
                    {t("wrongCount", { count: wrongCount })}
                  </span>
                </div>
                <DialogPrimitive.Description className="text-muted-foreground mt-1 text-xs sm:text-sm">
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
        <Link
          key={prediction.fixtureId}
          href={`/matches/${prediction.fixtureId}`}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3 py-2.5 outline-none transition-colors duration-150 hover:bg-white/[0.035] focus-visible:bg-white/[0.055] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-3 sm:px-5 sm:py-3.5"
        >
          <span className="min-w-0">
            <HistoryMatchup
              homeTeam={prediction.homeTeam}
              awayTeam={prediction.awayTeam}
              locale={locale}
              versus={t("versus")}
            />
            <span className="text-muted-foreground mt-0.5 hidden text-xs sm:block">
              {formatDateTime(locale, prediction.kickoffAt)}
            </span>
          </span>
          <time
            dateTime={prediction.kickoffAt}
            dir="ltr"
            className="text-muted-foreground shrink-0 text-[0.6rem] tabular-nums sm:hidden"
          >
            {formatCompactDateTime(locale, prediction.kickoffAt)}
          </time>
          <span className="col-span-2 grid grid-cols-3 gap-1 rounded-lg bg-white/[0.025] px-1.5 py-1 sm:contents">
            <HistoryValue label={t("prediction")} value={`${prediction.predictedHomeGoals}:${prediction.predictedAwayGoals}`} />
            <HistoryValue label={t("result")} value={prediction.actualHomeGoals === null || prediction.actualAwayGoals === null ? t("awaitingResult") : `${prediction.actualHomeGoals}:${prediction.actualAwayGoals}`} />
            <HistoryValue
              label={t("points")}
              value={prediction.points ?? "—"}
              tone={predictionResultTone(prediction)}
            />
          </span>
        </Link>
      ))}
    </div>
  );
}

function HistoryMatchup({
  homeTeam,
  awayTeam,
  locale,
  versus,
}: {
  homeTeam: LeaderboardTeam;
  awayTeam: LeaderboardTeam;
  locale: string;
  versus: string;
}) {
  return (
    <span
      dir={locale === "he" ? "rtl" : "ltr"}
      className="flex min-w-0 items-center justify-start gap-1 text-xs font-medium sm:text-sm"
    >
      <HistoryTeam team={homeTeam} locale={locale} />
      <span className="text-muted-foreground shrink-0 text-[0.65rem] leading-none">
        {versus}
      </span>
      <HistoryTeam team={awayTeam} locale={locale} />
    </span>
  );
}

function HistoryTeam({ team, locale }: { team: LeaderboardTeam; locale: string }) {
  const name = locale === "he" ? team.nameHe : team.nameEn;

  return (
    <span className="flex min-w-0 max-w-[calc(50%_-_0.75rem)] items-center gap-1">
      <span className="bg-muted relative size-5 shrink-0 overflow-hidden rounded-full border border-white/10">
        {team.logoUrl ? (
          <Image
            src={team.logoUrl}
            alt=""
            fill
            sizes="20px"
            className="object-contain p-0.5"
            unoptimized
          />
        ) : null}
      </span>
      <span dir="auto" className="truncate">
        <bdi>{name}</bdi>
      </span>
    </span>
  );
}

type HistoryResultTone = "exact" | "direction" | "wrong";

function predictionResultTone(
  prediction: LeaderboardPrediction
): HistoryResultTone | null {
  if (
    prediction.points === null ||
    prediction.actualHomeGoals === null ||
    prediction.actualAwayGoals === null
  ) {
    return null;
  }

  if (
    prediction.predictedHomeGoals === prediction.actualHomeGoals &&
    prediction.predictedAwayGoals === prediction.actualAwayGoals
  ) {
    return "exact";
  }

  return Math.sign(
    prediction.predictedHomeGoals - prediction.predictedAwayGoals
  ) === Math.sign(prediction.actualHomeGoals - prediction.actualAwayGoals)
    ? "direction"
    : "wrong";
}

function HistoryValue({
  label,
  value,
  tone = null,
}: {
  label: string;
  value: string | number;
  tone?: HistoryResultTone | null;
}) {
  return (
    <span className="flex min-w-0 items-baseline justify-center gap-1 sm:block sm:min-w-20 sm:text-center">
      <span className="text-muted-foreground shrink-0 text-[0.58rem] sm:text-[0.65rem]">{label}</span>
      <span
        data-numeric
        dir={typeof value === "string" && /^\d+:\d+$/.test(value) ? "ltr" : undefined}
        className={cn(
          "truncate text-xs font-semibold tabular-nums sm:mt-0.5 sm:block sm:text-sm",
          tone === "exact"
            ? "text-success"
            : tone === "direction"
              ? "text-warning"
              : tone === "wrong"
                ? "text-destructive"
                : "text-muted-foreground"
        )}
      >
        {value}
      </span>
    </span>
  );
}

function formatDateTime(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatCompactDateTime(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
