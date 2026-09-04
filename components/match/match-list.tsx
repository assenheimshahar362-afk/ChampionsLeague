"use client";

import { CalendarDays, ChevronDown, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AutoPredictDialog } from "@/components/match/auto-predict-dialog";
import { MatchCard } from "@/components/match/match-card";
import { Button } from "@/components/ui/button";
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

/** Long enough to absorb typing, short enough to feel saved. */
const SAVE_DEBOUNCE_MS = 700;

type SaveStatus = "idle" | "saving" | "saved" | "error";

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
  canPredict,
  nowIso,
}: {
  fixtures: Fixture[];
  /** The user's stored picks, loaded server-side. Empty when signed out. */
  initialPredictions?: Record<string, Prediction>;
  /** One shared, cached analysis per fixture. */
  aiPredictions?: Record<string, AiPrediction>;
  /** Signed-out visitors see the list and the inputs, but cannot fill them. */
  canPredict: boolean;
  /** The request clock, fixed so the server and client agree on the next round. */
  nowIso: string;
}) {
  const t = useTranslations("match");
  const locale = useLocale();
  const [predictions, setPredictions] =
    useState<Record<string, Prediction>>(initialPredictions);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorCode, setErrorCode] = useState<PredictionErrorCode | null>(null);
  const [autoSavedCount, setAutoSavedCount] = useState<number | null>(null);
  const [visibleRoundCount, setVisibleRoundCount] = useState(1);
  const nowTime = new Date(nowIso).getTime();

  // One pending timer per fixture, so editing two cards in quick succession
  // does not have the second cancel the first one's save.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    // Flushing on unmount would fire writes for a screen the user has left, so
    // pending saves are dropped instead. The debounce is short enough that the
    // window for losing one is small, and navigating away mid-keystroke is not
    // a commitment to that scoreline.
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const persist = useCallback(
    (fixtureId: string, run: () => Promise<{ status: string; code?: PredictionErrorCode }>) => {
      const existing = timers.current.get(fixtureId);
      if (existing) clearTimeout(existing);

      setSaveStatus("saving");
      setErrorCode(null);
      setAutoSavedCount(null);

      const timer = setTimeout(async () => {
        timers.current.delete(fixtureId);
        try {
          const result = await run();
          if (result.status === "error") {
            setSaveStatus("error");
            setErrorCode(result.code ?? "generic");
          } else {
            setSaveStatus("saved");
          }
        } catch {
          // A dropped connection must not look like a successful save.
          setSaveStatus("error");
          setErrorCode("generic");
        }
      }, SAVE_DEBOUNCE_MS);

      timers.current.set(fixtureId, timer);
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
        homeGoals: homeGoals ?? 0,
        awayGoals: awayGoals ?? 0,
      };
      return next;
    });

    // A half-filled card is not yet a prediction, and there is no way to
    // withdraw one — 0001_init.sql grants no DELETE. So clearing the boxes is a
    // local edit only, and a reload restores the stored call.
    if (homeGoals === null || awayGoals === null) return;

    persist(fixtureId, () =>
      savePrediction({ fixtureId, homeGoals, awayGoals })
    );
  }

  const rounds = useMemo<DisplayRound[]>(() => {
    const map = new Map<string, Fixture[]>();
    for (const fixture of fixtures) {
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
    const season = fixtures[0]?.season;
    const actualStages = new Set(fixtureRounds.map((round) => round.fixtures[0]!.stage));
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
    const upcoming = combined.filter(
      (round) => new Date(round.endAt).getTime() >= nowTime
    );

    // Once the whole season is over, retain its last real round instead of
    // replacing the home screen with an empty state.
    return upcoming.length > 0 ? upcoming : fixtureRounds.slice(-1);
  }, [fixtures, nowTime]);

  const visibleRounds = rounds.slice(0, visibleRoundCount);
  const hasMoreRounds = visibleRoundCount < rounds.length;
  const openFixtures = useMemo(
    () =>
      fixtures.filter(
        (fixture) =>
          fixture.status === "scheduled" &&
          new Date(fixture.kickoffAt).getTime() > nowTime
      ),
    [fixtures, nowTime]
  );
  const missingPredictionCount = openFixtures.filter(
    (fixture) => predictions[fixture.id] === undefined
  ).length;

  async function applyAutomaticPredictions(mode: AutoPredictionMode) {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    setSaveStatus("saving");
    setErrorCode(null);
    setAutoSavedCount(null);

    const targets =
      mode === "missing"
        ? openFixtures.filter((fixture) => predictions[fixture.id] === undefined)
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

  return (
    <div className="space-y-5">
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
            <section key={round.id} className="enter-fade space-y-4">
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
                          prediction={predictions[fixture.id]}
                          aiPrediction={aiPredictions[fixture.id]}
                          locked={fixture.status !== "scheduled"}
                          canPredict={canPredict}
                          enterIndex={firstIndex + index}
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
            onClick={() =>
              setVisibleRoundCount((count) => Math.min(count + 1, rounds.length))
            }
          >
            {t("loadMoreRound")}
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
          <p className="text-muted-foreground text-[11px]">
            {t("roundProgress", {
              shown: visibleRounds.length,
              total: rounds.length,
            })}
          </p>
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
