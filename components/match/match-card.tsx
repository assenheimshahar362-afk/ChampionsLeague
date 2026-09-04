"use client";

import { BrainCircuit, ChevronDown, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";

import { LockCountdown } from "@/components/match/lock-countdown";
import { GuessChip, ScoreBox } from "@/components/match/score-box";
import { TeamCrest } from "@/components/match/team-crest";
import { Link } from "@/i18n/navigation";
import type {
  AiPrediction,
  Fixture,
  Prediction,
  Team,
} from "@/lib/fixtures/types";
import { isInPlay } from "@/lib/fixtures/types";
import { projectedPoints } from "@/lib/scoring/engine";
import { cn } from "@/lib/utils";

/**
 * One fixture, as its own card.
 *
 * Laid out after the reference: a tinted band across the top carrying the
 * timing, then the two clubs facing each other with the prediction between
 * them. Crest above name at each end, a filled block in the middle.
 *
 * The band is the part that earns its keep. Before it, kickoff was one small
 * grey number competing with everything else on the row — and a prediction game
 * lives or dies on people knowing when a match closes, so giving that its own
 * full-width strip is the thing the reference gets right.
 *
 * Cards are separate rather than rows in a divided list. Eighteen hairline-
 * separated rows read as a table to be scanned; eighteen cards read as eighteen
 * things each waiting for an answer, which is what they are.
 */

/** How the middle column is behaving right now. */
type Middle = "open" | "signedOut" | "played";

/**
 * A club's crest, centred in its half of the row.
 *
 * Crest only: the name moved up into the band, directly above this, which is
 * what let the badge grow. Both are centred on the same axis, so a club reads
 * as one object stacked name-over-badge rather than two things drifting apart
 * — and a two-line name no longer shifts its badge off true.
 *
 * Sitting in flow rather than absolutely positioned means the row reserves real
 * width for it, so it can never ride over the score control no matter how long
 * the fixture list gets.
 */
function TeamSide({ team }: { team: Team }) {
  return (
    <div className="flex min-w-0 flex-1 justify-center">
      <TeamCrest
        team={team}
        className={cn(
          "size-[4.5rem] shrink-0 sm:size-[5.5rem]",
          // Reads as lifted off the card in both themes: dark enough to show
          // against a white card, soft enough not to smear on a navy one.
          "drop-shadow-[0_4px_8px_rgb(0_0_0/0.42)]"
        )}
      />
    </div>
  );
}

/**
 * A club's name — the outer column of the band, above its own crest.
 *
 * These are the loudest text on the card by design. A fixture is two clubs
 * before it is anything else, and everything competing with them here (kickoff,
 * countdown, points) is a detail you read second, so it is set smaller, quieter
 * and boxed off in the middle column.
 *
 * Centred in its column rather than pushed to the outer edge, so a one-line
 * name and a two-line one sit over the same axis instead of drifting apart.
 * `text-balance` on the two-line clamp keeps "Borussia Dortmund" splitting
 * evenly rather than dropping a single orphaned word onto the second line.
 */
function TeamName({ team }: { team: Team }) {
  return (
    /* dir=auto: Latin club names inside a Hebrew page. Without it the
       punctuation and the line breaks land on the wrong side. */
    <span
      dir="auto"
      className="line-clamp-2 min-w-0 px-2.5 text-center text-sm leading-tight font-bold tracking-tight text-balance sm:px-4 sm:text-[15px]"
    >
      {team.shortName}
    </span>
  );
}

/**
 * Points earned.
 *
 * While a match is in play the number is provisional, so it is drawn as a
 * dashed outline with the live colour rather than the solid green of a settled
 * score — §4 requires provisional points to be unmistakable.
 */
function PointsPill({
  points,
  provisional,
}: {
  points: number;
  provisional: boolean;
}) {
  const t = useTranslations("match");

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        provisional
          ? "border-live text-live border border-dashed"
          : points > 0
            ? "bg-success/15 text-success"
            : "bg-muted text-muted-foreground"
      )}
    >
      <span data-numeric>{points}</span>
      <span className="font-normal">
        {provisional ? t("provisional") : t("points")}
      </span>
    </span>
  );
}

export function MatchCard({
  fixture,
  prediction,
  aiPrediction,
  locked,
  canPredict,
  enterIndex,
  onChange,
}: {
  fixture: Fixture;
  prediction: Prediction | undefined;
  aiPrediction?: AiPrediction;
  /** The fixture has kicked off. Authority is the RLS policy (§11). */
  locked: boolean;
  /** Signed in. Signed-out visitors see the inputs, but locked. */
  canPredict: boolean;
  /** Position in the matchday, counted across days — drives the stagger. */
  enterIndex: number;
  onChange: (homeGoals: number | null, awayGoals: number | null) => void;
}) {
  const t = useTranslations("match");

  const inPlay = isInPlay(fixture);
  const breakdown = prediction
    ? projectedPoints(prediction, fixture)
    : null;

  const middle: Middle = locked ? "played" : canPredict ? "open" : "signedOut";
  const answered = prediction !== undefined && !locked;

  /*
   * The middle column, stacked: what the clock says on top, what it means
   * underneath. Two short lines beat one long one here — the column has to stay
   * narrow enough that the club names either side of it keep their width.
   */
  const when: ReactNode = inPlay ? (
    <span className="text-live inline-flex items-center gap-1 text-[11px] font-bold">
      <span
        className="bg-live pulse-live inline-block size-1.5 rounded-full"
        aria-hidden="true"
      />
      {/* Never colour alone (§8): the word and the minute carry it too. */}
      {t("live")}
      <span dir="ltr" data-numeric>
        {fixture.elapsedMinutes}&apos;
      </span>
    </span>
  ) : locked ? (
    <span className="text-[11px] font-semibold">{t("finalScore")}</span>
  ) : (
    <span className="inline-flex items-baseline gap-1">
      {/* The label is worth its meaning but not its width: under a fixture,
          beside a countdown, a bare time can only be the kickoff. Kept for
          anyone listening rather than looking. */}
      <span className="sr-only">{t("kickoff")}</span>
      <KickoffTime iso={fixture.kickoffAt} />
    </span>
  );

  const outcome: ReactNode =
    prediction && breakdown ? (
      <PointsPill points={breakdown.totalPoints} provisional={inPlay} />
    ) : !locked ? (
      // Always shown, unlike the old inline countdown that only appeared within
      // six hours of kickoff. Saying when a match closes is the whole job of
      // this column. Stacked under the time, so when it renders nothing the
      // flex gap simply collapses — there is no separator left dangling.
      <LockCountdown
        kickoffAt={fixture.kickoffAt}
        prefix={t("locksIn")}
        className="text-muted-foreground text-[10px]"
      />
    ) : null;

  return (
    <li
      // The stagger index is data, not a class: eighteen generated delay
      // classes would be eighteen rules for one number.
      style={{ "--enter-index": enterIndex } as CSSProperties}
      className={cn(
        // No `overflow-hidden`: the `before:` glow ring is inset -1px and
        // would be clipped away by it. Nothing here needs clipping — every
        // background is painted by an element carrying its own radius.
        "enter-rise bg-card/55 relative isolate rounded-lg border border-white/15 backdrop-blur-xl",
        "shadow-[0_10px_28px_rgb(8_4_24/0.28),0_0_18px_oklch(0.72_0.16_303/0.12)]",
        "before:pointer-events-none before:absolute before:inset-[-1px] before:-z-10 before:rounded-[9px] before:border before:border-primary/25 before:blur-[2px]",
        "ease-tint transition-colors duration-200",
        // An answered fixture is marked on its edge, so progress down a long
        // matchday stays readable while scrolling past at speed.
        answered && "border-primary/45"
      )}
    >
      {/* Match the body row's padding, gaps, and fixed prediction width so each
          club name is centred on exactly the same axis as its crest. */}
      <div className="from-primary/16 to-primary/5 border-primary/20 grid grid-cols-[minmax(0,1fr)_116px_minmax(0,1fr)] items-center gap-1 rounded-t-lg border-b bg-gradient-to-b px-2 py-1.5 backdrop-blur-md sm:grid-cols-[minmax(0,1fr)_132px_minmax(0,1fr)] sm:gap-3 sm:px-5">
        <TeamName team={fixture.homeTeam} />

        <div className="border-primary/15 flex min-w-0 flex-col items-center justify-center gap-0.5 border-x px-2.5 text-center sm:px-4">
          {when}
          {outcome}
        </div>

        <TeamName team={fixture.awayTeam} />
      </div>

      {/* Crests at the outer edges, the prediction (or the result) between
          them. DOM order stays home → away, so the whole row mirrors correctly
          under RTL without a second set of rules. */}
      <div
        className={cn(
          "ease-tint relative flex items-center gap-1 px-2 py-2 transition-colors duration-200 sm:gap-3 sm:px-5 sm:py-3",
          // Safe to round the bottom unconditionally with the tint: `answered`
          // implies the fixture is still open, which implies there is no
          // "you predicted" footer under this, which makes the body last.
          answered && "bg-primary/[0.05] rounded-b-lg"
        )}
      >
        <TeamSide team={fixture.homeTeam} />

        <div className="flex w-[116px] shrink-0 flex-col items-center justify-center gap-2 sm:w-[132px]">
          {middle === "played" ? (
            <FinalScore fixture={fixture} />
          ) : (
            <PredictionInputs
              fixture={fixture}
              prediction={prediction}
              disabled={middle === "signedOut"}
              onChange={onChange}
            />
          )}

          <OutcomePoints fixture={fixture} />

          <Link
            href={`/matches/${fixture.id}`}
            aria-label={t("openDetails", {
              home: fixture.homeTeam.name,
              away: fixture.awayTeam.name,
            })}
            className={cn(
              "border-primary/25 bg-primary/[0.08] text-primary inline-flex h-7 items-center justify-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold",
              "focus-visible:ring-primary/40 ease-snap transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:outline-none"
            )}
          >
            <Info className="size-3" aria-hidden="true" />
            {t("details")}
          </Link>
        </div>

        <TeamSide team={fixture.awayTeam} />
      </div>

      {/* What was called, once it can no longer be changed. Rendered only when
          it has something to say — an always-present line of grey text under
          eighteen cards is furniture, not information. */}
      {locked && prediction ? (
        <p className="text-muted-foreground mx-3 border-t py-1.5 text-center text-[11px]">
          <span dir="ltr">
            {t("youPredicted", {
              score: `${prediction.homeGoals}–${prediction.awayGoals}`,
            })}
          </span>
        </p>
      ) : null}

      {aiPrediction ? (
        <AiPredictionPanel prediction={aiPrediction} fixture={fixture} />
      ) : null}
    </li>
  );
}

function AiPredictionPanel({
  prediction,
  fixture,
}: {
  prediction: AiPrediction;
  fixture: Fixture;
}) {
  const t = useTranslations("match.aiPrediction");
  const probabilities = [
    {
      label: fixture.homeTeam.shortName,
      value: prediction.homeWinProbability,
    },
    { label: t("draw"), value: prediction.drawProbability },
    {
      label: fixture.awayTeam.shortName,
      value: prediction.awayWinProbability,
    },
  ];

  return (
    <details className="group/ai border-primary/15 border-t">
      <summary className="focus-visible:ring-primary/40 flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="bg-primary/12 text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-md">
          <BrainCircuit className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-primary block text-[10px] font-bold tracking-wide uppercase">
            {t("title")}
          </span>
          <span className="block text-sm font-bold" dir="auto">
            {fixture.homeTeam.shortName}{" "}
            <span dir="ltr" data-numeric>
              {prediction.predictedHomeGoals}-{prediction.predictedAwayGoals}
            </span>{" "}
            {fixture.awayTeam.shortName}
          </span>
        </span>
        <span className="text-muted-foreground text-[11px]">
          {t("confidence", { value: prediction.confidence })}
        </span>
        <ChevronDown
          className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-open/ai:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="border-primary/10 space-y-3 border-t px-3 pt-3 pb-4">
        <div className="grid grid-cols-3 gap-2">
          {probabilities.map((item) => (
            <div key={item.label} className="min-w-0 text-center">
              <span className="block truncate text-[10px] font-semibold" dir="auto">
                {item.label}
              </span>
              <span className="text-primary block text-sm font-bold" data-numeric>
                {item.value}%
              </span>
              <span className="bg-muted mt-1 block h-1 overflow-hidden rounded-full">
                <span
                  className="bg-primary block h-full rounded-full"
                  style={{ width: `${item.value}%` }}
                />
              </span>
            </div>
          ))}
        </div>

        <p className="text-foreground/90 text-xs leading-relaxed" dir="auto">
          {prediction.summary}
        </p>

        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-bold uppercase">
            {t("keyFactors")}
          </p>
          <ul className="grid gap-1 text-xs">
            {prediction.keyFactors.map((factor) => (
              <li key={factor} className="flex items-start gap-2" dir="auto">
                <span className="bg-primary mt-1.5 size-1 shrink-0 rounded-full" aria-hidden="true" />
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground text-[10px]">{t("disclaimer")}</p>
      </div>
    </details>
  );
}

function OutcomePoints({ fixture }: { fixture: Fixture }) {
  const t = useTranslations("match");

  return (
    <div
      className="grid w-[116px] grid-cols-[36px_44px_36px] text-[11px] font-semibold text-foreground sm:w-[132px] sm:grid-cols-[44px_44px_44px]"
      aria-label={t("outcomePoints", {
        home: fixture.outcomePoints.home,
        draw: fixture.outcomePoints.draw,
        away: fixture.outcomePoints.away,
      })}
    >
      {[
        fixture.outcomePoints.home,
        fixture.outcomePoints.draw,
        fixture.outcomePoints.away,
      ].map((points, index) => (
        <span
          key={index}
          data-numeric
          className="border-primary/20 bg-primary/[0.07] mx-auto inline-flex min-w-6 items-center justify-center rounded-md border px-1 py-0.5"
        >
          {points}
        </span>
      ))}
    </div>
  );
}

/**
 * The two goal boxes, with the guess chip between them.
 *
 * Signed out they are rendered, not hidden: a visitor should see exactly what
 * the game asks of them. They are inert, the chip becomes a padlock, and the
 * whole group is a link to sign-in — so the obvious thing to do (tap the boxes)
 * leads where it should instead of doing nothing.
 */
function PredictionInputs({
  fixture,
  prediction,
  disabled,
  onChange,
}: {
  fixture: Fixture;
  prediction: Prediction | undefined;
  disabled: boolean;
  onChange: (homeGoals: number | null, awayGoals: number | null) => void;
}) {
  const t = useTranslations("match");

  const boxes = (
    <>
      <ScoreBox
        value={prediction?.homeGoals ?? null}
        disabled={disabled}
        highlight={
          prediction !== undefined && prediction.homeGoals > prediction.awayGoals
        }
        filled={prediction !== undefined}
        label={t("goalsFor", { team: fixture.homeTeam.shortName })}
        className="w-9 rounded-e-none border-e-0 sm:w-11"
        onChange={(next) => onChange(next, prediction?.awayGoals ?? null)}
      />
      <GuessChip locked={disabled} label={t("guess")} />
      <ScoreBox
        value={prediction?.awayGoals ?? null}
        disabled={disabled}
        highlight={
          prediction !== undefined && prediction.awayGoals > prediction.homeGoals
        }
        filled={prediction !== undefined}
        label={t("goalsFor", { team: fixture.awayTeam.shortName })}
        className="w-9 rounded-s-none border-s-0 sm:w-11"
        onChange={(next) => onChange(prediction?.homeGoals ?? null, next)}
      />
    </>
  );

  // The prediction bar is 116px on mobile and 132px from `sm`. The middle
  // keeps that width whether it is answered, padlocked, or
  // showing a result, so a card never reflows as its state changes.
  if (!disabled) {
    return <div className="flex items-center">{boxes}</div>;
  }

  return (
    <Link
      href="/sign-in"
      aria-label={t("signInToPlay")}
      className={cn(
        "focus-visible:ring-primary/40 flex items-center rounded-xl focus-visible:ring-2 focus-visible:outline-none",
        // The boxes themselves are inert, so the press feedback has to live
        // here. Without it a tap on a padlock feels like nothing happened,
        // right up until the page changes underneath.
        "ease-snap transition-transform duration-150 active:scale-[0.97]"
      )}
    >
      {boxes}
    </Link>
  );
}

/** The real scoreline, once the fixture has one. */
function FinalScore({ fixture }: { fixture: Fixture }) {
  return (
    <span
      data-numeric
      dir="ltr"
      className="pt-1.5 text-2xl font-bold tabular-nums"
    >
      {fixture.homeGoals ?? "–"}
      <span className="text-muted-foreground mx-1 font-normal">-</span>
      {fixture.awayGoals ?? "–"}
    </span>
  );
}

function KickoffTime({ iso }: { iso: string }) {
  const locale = useLocale();

  // Formatted in the app's locale but the *device's* timezone, which the server
  // cannot know — hence the suppressed warning. Storage is always UTC.
  return (
    <time
      dateTime={iso}
      suppressHydrationWarning
      data-numeric
      className="text-xs font-bold"
    >
      {new Date(iso).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        // 24-hour in both languages. Left to the locale, `en` renders
        // "02:00 PM", which is half again as wide and wrapped the band onto two
        // lines. It is also the wrong convention here: this is a European
        // competition read by an Israeli audience, and both use a 24-hour clock
        // for kickoffs.
        hourCycle: "h23",
      })}
    </time>
  );
}
