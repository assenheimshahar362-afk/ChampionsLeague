import type { Fixture, Stage } from "@/lib/fixtures/types";

function roundToMatchday(round: string): number | null {
  const match = /(?:League Stage|GROUP_[A-Z]) - (\d+)$/.exec(round);
  return match ? Number(match[1]) : null;
}

/**
 * Round labels for display.
 *
 * The provider's own label ("League Stage - 5") is stored verbatim and is the
 * key the app groups by, but it is English, unpunctuated, and not something to
 * put in front of a Hebrew reader. This turns it into a translation key plus
 * its values, so the message catalogue owns the wording (§9).
 */

export type RoundLabel = {
  /** Key under the `match.rounds` namespace. */
  key: Stage;
  values: { matchday: number };
};

export function roundLabelFor(stage: Stage, round: string): RoundLabel {
  return {
    key: stage,
    // Only read for `league_phase`; the knockout messages ignore it.
    values: { matchday: roundToMatchday(round) ?? 0 },
  };
}

/** The label for a set of fixtures, which all share a round. */
export function roundLabelForFixtures(fixtures: Fixture[]): RoundLabel | null {
  const first = fixtures[0];
  if (!first) return null;
  return roundLabelFor(first.stage, first.round);
}
