import { setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";

import { Hero } from "@/components/hero";
import { MatchList } from "@/components/match/match-list";
import { SetupNotice } from "@/components/setup-notice";
import { isLocale } from "@/i18n/routing";
import {
  SchemaNotReadyError,
  getCurrentAndFutureRoundFixtures,
  getMyPredictions,
} from "@/lib/fixtures/queries";
import type { Fixture, Prediction } from "@/lib/fixtures/types";
import { getUser } from "@/lib/supabase/server";

/**
 * Home — the matchday list.
 *
 * The permanent brand hero introduces the social game, then hands over to the
 * real fixture list. A signed-out visitor still sees the prediction boxes —
 * padlocked, but there — immediately below the pitch.
 *
 * Fixtures come from Supabase, populated by the ingestion job. Reading them on
 * the server means the client receives fixed ISO timestamps rather than
 * deriving any from its own clock, so server and client agree on what is locked.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);

  return (
    <main className="w-full flex-1 pb-16">
      <div className="mx-auto w-full max-w-5xl px-4 py-5">
        <Hero />
      </div>

      <div className="mx-auto w-full max-w-2xl px-4">
        <Suspense fallback={<MatchdayFallback />}>
          <MatchdayContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}

async function MatchdayContent({ locale }: { locale: string }) {
  await connection();
  const nowIso = new Date().toISOString();
  const user = await getUser();
  let fixtures: Fixture[] = [];
  let predictions: Record<string, Prediction> = {};

  try {
    [fixtures, predictions] = await Promise.all([
      getCurrentAndFutureRoundFixtures(locale),
      user ? getMyPredictions(user.id) : Promise.resolve({}),
    ]);
  } catch (error) {
    // Migrations not applied yet. Everything else is a real fault and must
    // still surface — swallowing it would hide genuine breakage behind a
    // friendly setup notice.
    if (!(error instanceof SchemaNotReadyError)) throw error;
    return <SetupNotice reason="schema" />;
  }

  // Before the first ingest there is nothing to show, and an empty page with no
  // explanation reads as a bug.
  if (fixtures.length === 0) return <SetupNotice reason="empty" />;

  return (
    <div id="matches" className="scroll-mt-20">
      <MatchList
        fixtures={fixtures}
        initialPredictions={predictions}
        canPredict={Boolean(user)}
        nowIso={nowIso}
      />
    </div>
  );
}

function MatchdayFallback() {
  return (
    <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="bg-card/55 h-36 rounded-lg border border-white/15" />
      ))}
    </div>
  );
}
