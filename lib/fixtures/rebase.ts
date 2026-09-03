/**
 * Kickoff rebasing.
 *
 * Season 2024 is over, so every fixture in it is in the past and permanently
 * locked — nobody could ever place a prediction. Rebasing maps the finished
 * season onto a timeline that starts around now, so the full
 * predict -> lock -> live -> settle loop can actually be exercised.
 *
 *     rebased = ingestTime + (realKickoff - pivot) * scale
 *
 * Every knob is configuration, and `enabled: false` makes this an identity
 * function. Switching to the real 2026/27 season is therefore
 * `REBASE_ENABLED=false` plus a re-ingest, not a code change — which is the
 * whole reason the rebase is confined to this one module.
 *
 * Pure and I/O-free so ingest and tests agree exactly.
 */

export type RebaseConfig = {
  enabled: boolean;
  /**
   * The instant in real season time that maps onto `ingestTime`.
   *
   * Fixtures before it land in the past (settled, results visible); fixtures
   * after it land in the future (open for prediction). Pointing this at the
   * season's opening day would leave nothing settled and an empty leaderboard,
   * so the useful default sits a few matchdays in.
   */
  pivot: Date;
  /**
   * Time compression. 1 replays at true speed — an 8.5-month season. Smaller
   * values shorten the wait between matchdays: 0.04 replays the season in
   * roughly ten days.
   */
  scale: number;
  /** "Now" at ingest. Passed in rather than read, so the result is testable. */
  ingestTime: Date;
};

export type Rebaser = (realKickoffIso: string) => string;

/** Guards against a scale of 0 or a negative, which would collapse the season. */
export function normaliseScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return scale;
}

/**
 * Builds the rebasing function for one ingest run.
 *
 * The returned function is total: an unparseable timestamp is passed through
 * untouched rather than becoming `Invalid Date`, so one malformed fixture can
 * never abort an ingest.
 */
export function createRebaser(config: RebaseConfig): Rebaser {
  if (!config.enabled) return (iso) => iso;

  const scale = normaliseScale(config.scale);
  const pivotMs = config.pivot.getTime();
  const ingestMs = config.ingestTime.getTime();

  return (realKickoffIso: string): string => {
    const realMs = new Date(realKickoffIso).getTime();
    if (!Number.isFinite(realMs)) return realKickoffIso;

    const offsetFromPivot = realMs - pivotMs;
    return new Date(ingestMs + offsetFromPivot * scale).toISOString();
  };
}

/**
 * Default pivot for season 2024: just after the League Stage 2 fixtures on
 * 1-2 October 2024.
 *
 * Chosen so a fresh ingest yields two settled matchdays behind "now" and six
 * ahead — enough history for the score history to be non-empty, and enough
 * future for there to be something to predict.
 */
export const DEFAULT_PIVOT_2024 = "2024-10-03T00:00:00.000Z";

/**
 * Replays the season in ~10 days rather than ~8.5 months. Deliberately a
 * development default: production for a live season runs with the rebase off.
 */
export const DEFAULT_SCALE = 0.04;
