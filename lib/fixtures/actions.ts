"use server";

import { isLocale } from "@/i18n/routing";
import {
  getAiPredictions,
  getHomeFixtureRoundAfter,
} from "@/lib/fixtures/queries";
import type { FixtureRoundSelection } from "@/lib/fixtures/schedule";

export async function loadNextFixtureRound(input: {
  locale: string;
  cursor: FixtureRoundSelection;
}) {
  if (!isLocale(input.locale)) throw new Error("Unsupported locale");
  if (
    !Number.isInteger(input.cursor.season) ||
    typeof input.cursor.round !== "string" ||
    input.cursor.round.length === 0 ||
    input.cursor.round.length > 100
  ) {
    throw new Error("Invalid fixture round cursor");
  }

  const next = await getHomeFixtureRoundAfter(input.locale, input.cursor);
  const aiPredictions = await getAiPredictions(
    next.items.map((fixture) => fixture.id),
    input.locale
  );

  return {
    fixtures: next.items,
    aiPredictions,
    remainingRoundCount: next.remainingRoundCount,
  };
}
