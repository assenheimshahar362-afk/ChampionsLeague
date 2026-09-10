"use client";

import { CalendarDays, ChevronDown, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AutoPredictDialog } from "@/components/match/auto-predict-dialog";
import { KickoffBoundaryRefresh } from "@/components/match/kickoff-boundary-refresh";
import { LiveMatchRefresh } from "@/components/match/live-match-refresh";
import {
  MatchCard,
  type EditablePrediction,
} from "@/components/match/match-card";
import { Button } from "@/components/ui/button";
import { loadNextFixtureRound } from "@/lib/fixtures/actions";
import { roundLabelForFixtures } from "@/lib/fixtures/labels";
import type {
  AiPrediction,
  Fixture,
  Prediction,
  Stage,
} from "@/lib/fixtures/types";
import { cn } from "@/lib/utils";
import {
  saveAutoPredictions,
  savePrediction,
  type AutoPredictionMode,
  type PredictionErrorCode,
} from "@/lib/predictions/actions";
import { autoPredictionForFixture } from "@/lib/predictions/auto-pick";

/**
 * The matchday list — the core screen (§7).
 *
 * Laid out after the reference app: a date pill at the reading-start edge, then
 * one card per date holding that day's fixtures separated by hairlines.
 *
 * Predictions save optimistically: local state updates immediately and the
 * write follows, debounced, so typing a scoreline does not fire a request per
 * keystroke. The server is authoritative — a rejected write (most often because
 * the fixture locked mid-edit) surfaces as an error rather than being swallowed,
 * because silently keeping a prediction on screen that was never stored is the
 * one failure a prediction game cannot afford (§10).
 */

/** Shared feedback for the latest automatic save operation. */
type SaveStatus = "idle" | "saving" | "saved" | "error";

function hasCompleteScore(prediction: EditablePrediction | undefined): boolean {
  return (
    typeof prediction?.homeGoals === "number" &&
    typeof prediction.awayGoals === "number"
  );
}

type PlannedWindow = {
  label: "firstLeg" | "secondLeg" | "finalDate";
  dates: string[];
};

type PlannedRound = {
  kind: "planned";
  id: string;
  stage: Exclude<Stage, "league_phase">;
  matchCount: number;
  windows: PlannedWindow[];
  startAt: string;
  endAt: string;
  venue: string | null;
};

type FixtureRound = {
  kind: "fixtures";
  id: string;
  fixtures: Fixture[];
  startAt: string;
  endAt: string;
};

type DisplayRound = FixtureRound | PlannedRound;

/**
 * UEFA's published 2026/27 knockout calendar. Until the draw gives the API
 * concrete teams and home venues, these entries keep the rest of the season
 * visible without creating fake, predictable fixtures in the database.
 */
const KNOCKOUT_CALENDAR_2026: PlannedRound[] = [
  {
    kind: "planned",
    id: "2026-playoff",
    stage: "playoff",
    matchCount: 16,
    windows: [
      { label: "firstLeg", dates: ["2027-02-16", "2027-02-17"] },
      { label: "secondLeg", dates: ["2027-02-23", "2027-02-24"] },
    ],
    startAt: "2027-02-16T12:00:00.000Z",
    endAt: "2027-02-24T23:59:59.999Z",
    venue: null,
  },
  {
    kind: "planned",
    id: "2026-r16",
    stage: "r16",
    matchCount: 16,
    windows: [
      { label: "firstLeg", dates: ["2027-03-09", "2027-03-10"] },
      { label: "secondLeg", dates: ["2027-03-16", "2027-03-17"] },
    ],
    startAt: "2027-03-09T12:00:00.000Z",
    endAt: "2027-03-17T23:59:59.999Z",
    venue: null,
  },
  {
    kind: "planned",
    id: "2026-qf",
    stage: "qf",
    matchCount: 8,
    windows: [
      { label: "firstLeg", dates: ["2027-04-06", "2027-04-07"] },
      { label: "secondLeg", dates: ["2027-04-13", "2027-04-14"] },
    ],
    startAt: "2027-04-06T12:00:00.000Z",
    endAt: "2027-04-14T23:59:59.999Z",
    venue: null,
  },
  {
    kind: "planned",
    id: "2026-sf",
    stage: "sf",
    matchCount: 4,
    windows: [
      { label: "firstLeg", dates: ["2027-04-27", "2027-04-28"] },
      { label: "secondLeg", dates: ["2027-05-04", "2027-05-05"] },
    ],
    startAt: "2027-04-27T12:00:00.000Z",
    endAt: "2027-05-05T23:59:59.999Z",
    venue: null,
  },
  {
    kind: "planned",
    id: "2026-final",
    stage: "final",
    matchCount: 1,
    windows: [{ label: "finalDate", dates: ["2027-06-05"] }],
    startAt: "2027-06-05T12:00:00.000Z",
    endAt: "2027-06-05T23:59:59.999Z",
    venue: "Estadio Metropolitano · Madrid",
  },
];

/**
 * Day heading for the date pill.
 *
 * The locale must be the app's, not the runtime default — otherwise the Hebrew
 * page renders English weekday names. The timezone stays undefined on purpose,
 * so the date is the one the *user* is living in (§9).
 */
function dayKey(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function MatchList({
  fixtures,
  initialPredictions = {},
  aiPredictions = {},
  remainingRoundCount: initialRemainingRoundCount = 0,
  availableStages = [],
  canPredict,
  nowIso,
}: {
  fixtures: Fixture[];
  /** The user's stored picks, loaded server-side. Empty when signed out. */
  initialPredictions?: Record<string, Prediction>;
  /** One shared, cached analysis per fixture. */
  aiPredictions?: Record<string, AiPrediction>;
  /** Actual database rounds not included in the initial response. */
  remainingRoundCount?: number;
  /** Stages present in the full season, including rounds not loaded yet. */
  availableStages?: Stage[];
  /** Signed-out visitors see the list and the inputs, but cannot fill them. */
  canPredict: boolean;
  /** The request clock, fixed so the server and client agree on the next round. */
  nowIso: string;
}) {
  const t = useTranslations("match");
  const locale = useLocale();
  const [predictions, setPredictions] =
    useState<Record<string, EditablePrediction>>(initialPredictions);
  const [loadedFixtures, setLoadedFixtures] = useState(fixtures);
  const [loadedAiPredictions, setLoadedAiPredictions] = useState(aiPredictions);
  const [remainingRoundCount, setRemainingRoundCount] = useState(
    initialRemainingRoundCount
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorCode, setErrorCode] = useState<PredictionErrorCode | null>(null);
  const [autoSavedCount, setAutoSavedCount] = useState<number | null>(null);
  const fixtureScrollTarget = useRef<HTMLLIElement | null>(null);
  const roundScrollTarget = useRef<HTMLElement | null>(null);
  const didScroll = useRef(false);
  const [additionalRoundCount, setAdditionalRoundCount] = useState(0);
  const nowTime = new Date(nowIso).getTime();

  // Only the newest response may update the shared save indicator. Next.js
  // dispatches Server Actions sequentially, but rapid score edits can still
  // leave an older response arriving while a newer write is queued.
  const saveVersion = useRef(0);

  const persist = useCallback(
    async (run: () => Promise<{ status: string; code?: PredictionErrorCode }>) => {
      const version = ++saveVersion.current;
      setSaveStatus("saving");
      setErrorCode(null);
      setAutoSavedCount(null);

      try {
        const result = await run();
        if (version !== saveVersion.current) return;
        if (result.status === "error") {
          setSaveStatus("error");
          setErrorCode(result.code ?? "generic");
        } else {
          setSaveStatus("saved");
        }
      } catch {
        if (version !== saveVersion.current) return;
        setSaveStatus("error");
        setErrorCode("generic");
      }
    },
    []
  );

  function setScore(
    fixtureId: string,
    homeGoals: number | null,
    awayGoals: number | null
  ) {
    setPredictions((prev) => {
      const next = { ...prev };

      // Clearing both boxes removes the prediction rather than storing a
      // half-empty one that would score as 0–0.
      if (homeGoals === null && awayGoals === null) {
        delete next[fixtureId];
        return next;
      }

      next[fixtureId] = {
        fixtureId,
        homeGoals,
        awayGoals,
      };
      return next;
    });

    // A half-filled card is not yet a prediction, and there is no way to
    // withdraw one — 0001_init.sql grants no DELETE. So clearing the boxes is a
    // local edit only, and a reload restores the stored call.
    if (homeGoals === null || awayGoals === null) return;

    void persist(() => savePrediction({ fixtureId, homeGoals, awayGoals }));
  }

  const rounds = useMemo<DisplayRound[]>(() => {
    const map = new Map<string, Fixture[]>();
    for (const fixture of loadedFixtures) {
      const key = `${fixture.season ?? "season"}:${fixture.round}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(fixture);
      else map.set(key, [fixture]);
    }

    const fixtureRounds: FixtureRound[] = [...map.entries()].map(
      ([id, roundFixtures]) => ({
        kind: "fixtures",
        id,
        fixtures: roundFixtures,
        startAt: roundFixtures[0]!.kickoffAt,
        endAt: roundFixtures.at(-1)!.kickoffAt,
      })
    );
    const season = loadedFixtures[0]?.season;
    const actualStages = new Set(availableStages);
    const planned =
      season === 2026
        ? KNOCKOUT_CALENDAR_2026.filter(
            (round) =>
              new Date(round.endAt).getTime() >= nowTime &&
              !actualStages.has(round.stage)
          )
        : [];
    const combined = [...fixtureRounds, ...planned].sort((a, b) =>
      a.startAt.localeCompare(b.startAt)
    );
    return combined;
  }, [availableStages, loadedFixtures, nowTime]);

  const actualRounds = rounds.filter((round) => round.kind === "fixtures");
  const targetRound = actualRounds.find((round) =>
    round.fixtures.some((fixture) =>
      fixture.status === "live" || fixture.status === "halftime"
    )
  ) ?? actualRounds.find((round) =>
    round.fixtures.some((fixture) =>
      fixture.status === "scheduled" && new Date(fixture.kickoffAt).getTime() >= nowTime
    )
  ) ?? actualRounds.at(-1);
  const targetRoundIndex = Math.max(
    0,
    rounds.findIndex((round) => round.id === targetRound?.id)
  );
  const visibleRounds = rounds.slice(
    0,
    Math.min(targetRoundIndex + 1 + additionalRoundCount, rounds.length)
  );
  const hasMoreRounds =
    remainingRoundCount > 0 || visibleRounds.length < rounds.length;
  const totalRoundCount = rounds.length + remainingRoundCount;

  const openFixtures = useMemo(
    () =>
      loadedFixtures.filter(
        (fixture) =>
          fixture.status === "scheduled" &&
          new Date(fixture.kickoffAt).getTime() > nowTime
      ),
    [loadedFixtures, nowTime]
  );
  const firstUpcomingFixtureId = openFixtures[0]?.id;

  useEffect(() => {
    const target = firstUpcomingFixtureId
      ? fixtureScrollTarget.current
      : roundScrollTarget.current;
    if (didScroll.current || !target) return;
    target.scrollIntoView({ behavior: "instant", block: "start" });
    // Live refreshes must not pull the user away from the round they are reading.
    didScroll.current = true;
  }, [firstUpcomingFixtureId, targetRound?.id]);
  const missingPredictionCount = openFixtures.filter(
    (fixture) => !hasCompleteScore(predictions[fixture.id])
  ).length;
  const liveRefreshFixtures = useMemo(
    () =>
      loadedFixtures.map(({ kickoffAt, status }) => ({ kickoffAt, status })),
    [loadedFixtures]
  );

  async function applyAutomaticPredictions(mode: AutoPredictionMode) {
    saveVersion.current += 1;
    setSaveStatus("saving");
    setErrorCode(null);
    setAutoSavedCount(null);

    const targets =
      mode === "missing"
        ? openFixtures.filter((fixture) => !hasCompleteScore(predictions[fixture.id]))
        : openFixtures;
    const inputs = targets.map((fixture) => ({
      fixtureId: fixture.id,
      ...autoPredictionForFixture(fixture),
    }));

    try {
      const result = await saveAutoPredictions({ mode, predictions: inputs });
      if (result.status === "error") {
        setSaveStatus("error");
        setErrorCode(result.code);
        return false;
      }

      setPredictions((current) => {
        const next = { ...current };
        for (const prediction of result.predictions) {
          next[prediction.fixtureId] = prediction;
        }
        return next;
      });
      setAutoSavedCount(result.predictions.length);
      setSaveStatus("saved");
      return true;
    } catch {
      setSaveStatus("error");
      setErrorCode("generic");
      return false;
    }
  }

  async function loadMoreRound() {
    if (loadingMore) return;

    if (remainingRoundCount === 0) {
      setAdditionalRoundCount((count) => count + 1);
      return;
    }

    const lastActualRound = actualRounds.at(-1);
    const cursorFixture = lastActualRound?.fixtures[0];
    if (!cursorFixture || cursorFixture.season === undefined) return;

    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const result = await loadNextFixtureRound({
        locale,
        cursor: {
          season: cursorFixture.season,
          round: cursorFixture.round,
        },
      });
      if (result.fixtures.length === 0) {
        setRemainingRoundCount(0);
        return;
      }

      setLoadedFixtures((current) => {
        const byId = new Map(current.map((fixture) => [fixture.id, fixture]));
        for (const fixture of result.fixtures) byId.set(fixture.id, fixture);
        return [...byId.values()].sort((left, right) =>
          left.kickoffAt.localeCompare(right.kickoffAt)
        );
      });
      setLoadedAiPredictions((current) => ({
        ...current,
        ...result.aiPredictions,
      }));
      setRemainingRoundCount(result.remainingRoundCount);
      setAdditionalRoundCount((count) => count + 1);
    } catch {
      setLoadMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-5">
      <LiveMatchRefresh fixtures={liveRefreshFixtures} />
      <KickoffBoundaryRefresh kickoffAt={openFixtures[0]?.kickoffAt} />
      {canPredict ? (
        <div className="flex justify-center">
          <AutoPredictDialog
            totalCount={openFixtures.length}
            missingCount={missingPredictionCount}
            onChoose={applyAutomaticPredictions}
          />
        </div>
      ) : null}

      <div id="fixture-rounds" className="space-y-8">
        {visibleRounds.map((round) => {
          if (round.kind === "planned") {
            return (
              <PlannedRoundCard
                key={round.id}
                round={round}
                locale={locale}
              />
            );
          }

          const label = roundLabelForFixtures(round.fixtures);
          const dayGroups = groupFixturesByDay(round.fixtures, locale);
          let enterIndex = 0;

          return (
            <section
              key={round.id}
              ref={
                !firstUpcomingFixtureId && round.id === targetRound?.id
                  ? roundScrollTarget
                  : undefined
              }
              className="enter-fade scroll-mt-24 space-y-4"
            >
              {label ? (
                <RoundHeading>
                  {t(`rounds.${label.key}`, label.values)}
                </RoundHeading>
              ) : null}

              {dayGroups.map(([day, dayFixtures]) => {
                const firstIndex = enterIndex;
                enterIndex += dayFixtures.length;

                return (
                  <div key={day}>
                    {/* Pill sits at the reading start: right under RTL, left under LTR. */}
                    <div className="mb-2 flex">
                      <h3
                        suppressHydrationWarning
                        className="bg-secondary text-secondary-foreground rounded-lg px-3 py-1.5 text-sm font-semibold"
                      >
                        {day}
                      </h3>
                    </div>

                    <ul className="space-y-2.5">
                      {dayFixtures.map((fixture, index) => (
                        <MatchCard
                          key={fixture.id}
                          fixture={fixture}
                          prediction={
                            new Date(fixture.kickoffAt).getTime() <= nowTime
                              ? initialPredictions[fixture.id]
                              : predictions[fixture.id]
                          }
                          aiPrediction={loadedAiPredictions[fixture.id]}
                          locked={
                            fixture.status !== "scheduled" ||
                            new Date(fixture.kickoffAt).getTime() <= nowTime
                          }
                          canPredict={canPredict}
                          enterIndex={firstIndex + index}
                          scrollRef={
                            fixture.id === firstUpcomingFixtureId
                              ? fixtureScrollTarget
                              : undefined
                          }
                          onChange={(home, away) =>
                            setScore(fixture.id, home, away)
                          }
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {canPredict && saveStatus !== "idle" ? (
        <p
          // Save state changes without the user acting, so it has to be
          // announced rather than only shown.
          role="status"
          aria-live="polite"
          className={cn(
            // Rises in rather than snapping into place: it appears while the
            // user is looking somewhere else entirely — at the box they are
            // typing in — and an element that materialises in peripheral
            // vision reads as a glitch.
            "enter-fade rounded-lg px-4 py-3 text-center text-xs text-balance",
            saveStatus === "error"
              ? "text-destructive border-destructive/40 border"
              : "text-muted-foreground border border-dashed"
          )}
        >
          {saveStatus === "saving" ? t("saving") : null}
          {saveStatus === "saved"
            ? autoSavedCount === null
              ? t("saved")
              : t("autoPredict.saved", { count: autoSavedCount })
            : null}
          {saveStatus === "error" ? t(`saveError.${errorCode ?? "generic"}`) : null}
        </p>
      ) : null}

      {hasMoreRounds ? (
        <div className="flex flex-col items-center gap-2 pt-1">
          <Button
            type="button"
            size="lg"
            variant="outline"
            aria-controls="fixture-rounds"
            className="border-primary/30 bg-primary/[0.08] text-primary min-w-44 rounded-full shadow-[0_8px_24px_rgb(0_0_0/0.12)]"
            disabled={loadingMore}
            onClick={loadMoreRound}
          >
            {loadingMore ? t("loadingMoreRound") : t("loadMoreRound")}
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
          <p className="text-muted-foreground text-[11px]">
            {t("roundProgress", {
              shown: visibleRounds.length,
              total: totalRoundCount,
            })}
          </p>
          {loadMoreFailed ? (
            <p role="alert" className="text-destructive text-xs">
              {t("loadMoreError")}
            </p>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}

function groupFixturesByDay(fixtures: Fixture[], locale: string) {
  const map = new Map<string, Fixture[]>();
  for (const fixture of fixtures) {
    const key = dayKey(fixture.kickoffAt, locale);
    const bucket = map.get(key);
    if (bucket) bucket.push(fixture);
    else map.set(key, [fixture]);
  }
  return [...map.entries()];
}

function RoundHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="from-primary/20 h-px flex-1 bg-gradient-to-l to-transparent rtl:bg-gradient-to-r" />
      <h2 className="text-foreground text-base font-bold tracking-tight">
        {children}
      </h2>
      <span className="from-primary/20 h-px flex-1 bg-gradient-to-r to-transparent rtl:bg-gradient-to-l" />
    </div>
  );
}

function PlannedRoundCard({
  round,
  locale,
}: {
  round: PlannedRound;
  locale: string;
}) {
  const t = useTranslations("match");
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section className="enter-fade space-y-4">
      <RoundHeading>{t(`rounds.${round.stage}`, { matchday: 0 })}</RoundHeading>

      <div className="bg-card/55 relative overflow-hidden rounded-2xl border border-white/15 p-4 shadow-[0_12px_34px_rgb(8_4_24/0.24)] backdrop-blur-xl sm:p-5">
        <div
          aria-hidden="true"
          className="bg-primary/10 absolute -end-12 -top-16 size-36 rounded-full blur-3xl"
        />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <span className="bg-primary/10 text-primary inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold">
              {t("knockoutCalendar.published")}
            </span>
            <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed text-balance">
              {t("knockoutCalendar.teamsPending")}
            </p>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs font-semibold">
            {t("knockoutCalendar.matchCount", { count: round.matchCount })}
          </span>
        </div>

        <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
          {round.windows.map((window) => (
            <div
              key={window.label}
              className="border-primary/15 bg-background/25 flex items-start gap-2.5 rounded-xl border p-3"
            >
              <CalendarDays
                className="text-primary mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-muted-foreground text-[11px] font-medium">
                  {t(`knockoutCalendar.${window.label}`)}
                </p>
                <p data-numeric className="mt-0.5 text-sm font-semibold">
                  {window.dates
                    .map((date) => formatter.format(new Date(`${date}T12:00:00Z`)))
                    .join(" · ")}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-muted-foreground relative mt-3 flex items-center gap-2 text-xs">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span dir={round.venue ? "auto" : undefined}>
            {round.venue
              ? t("knockoutCalendar.venue", { venue: round.venue })
              : t("knockoutCalendar.venuesPending")}
          </span>
        </div>
      </div>
    </section>
  );
}
