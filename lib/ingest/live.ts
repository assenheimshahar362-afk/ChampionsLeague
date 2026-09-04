import "server-only";

import { footballDataGet, type FootballDataQuota } from "@/lib/football-data/client";
import {
  mapStatus,
  predictionScore,
  toFixtureProviderDetails,
  toFixtureResultRow,
} from "@/lib/football-data/mappers";
import type { WireMatchesResponse } from "@/lib/football-data/types";
import { serverEnv } from "@/lib/env.server";
import { isLivePollCandidate } from "@/lib/ingest/live-window";
import type { Json } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { settleDueFixtures } from "@/lib/settle/run";

export type LivePollReport = {
  enabled: boolean;
  requestMade: boolean;
  throttled: boolean;
  candidates: number;
  matchesReceived: number;
  fixturesUpdated: number;
  resultsStored: number;
  settledFixtures: number;
  quota: FootballDataQuota | null;
};

export async function pollLiveMatches(): Promise<LivePollReport> {
  const env = serverEnv();
  const report: LivePollReport = {
    enabled: !env.REBASE_ENABLED,
    requestMade: false,
    throttled: false,
    candidates: 0,
    matchesReceived: 0,
    fixturesUpdated: 0,
    resultsStored: 0,
    settledFixtures: 0,
    quota: null,
  };

  // A historical replay already contains final results. Polling the live API
  // there would reveal them on the compressed timeline.
  if (env.REBASE_ENABLED) return report;

  const db = createServiceRoleClient();
  const { data: possible, error: candidateError } = await db
    .from("fixtures")
    .select("id, football_data_id, kickoff_at, status")
    .in("status", ["scheduled", "live", "halftime", "postponed"])
    .not("football_data_id", "is", null);
  if (candidateError) {
    throw new Error(`Finding live-poll candidates failed: ${candidateError.message}`);
  }

  const candidates = (possible ?? []).filter((fixture) =>
    isLivePollCandidate({ status: fixture.status, kickoffAt: fixture.kickoff_at })
  );
  report.candidates = candidates.length;
  if (candidates.length === 0) return report;

  const { data: claimed, error: claimError } = await db.rpc(
    "claim_football_data_live_poll"
  );
  if (claimError) {
    throw new Error(`Claiming live poll failed: ${claimError.message}`);
  }
  if (!claimed) {
    report.throttled = true;
    return report;
  }

  const ids = candidates.flatMap((fixture) =>
    fixture.football_data_id === null ? [] : [fixture.football_data_id]
  );
  const response = await footballDataGet<WireMatchesResponse>(
    "/matches",
    { ids: ids.join(",") },
    { unfold: true, requestKind: "live" }
  );
  report.requestMade = true;
  report.quota = response.quota;
  report.matchesReceived = response.data.matches.length;

  const localByProviderId = new Map(
    candidates.flatMap((fixture) =>
      fixture.football_data_id === null
        ? []
        : [[fixture.football_data_id, fixture] as const]
    )
  );

  for (const match of response.data.matches) {
    const local = localByProviderId.get(match.id);
    if (!local) continue;
    const status = mapStatus(match.status);
    const liveOrFinished =
      status === "live" || status === "halftime" || status === "finished";
    const displayScore = liveOrFinished ? match.score.fullTime : null;
    const referee =
      match.referees?.find((entry) => entry.type === "REFEREE")?.name ??
      match.referees?.[0]?.name ??
      null;
    const { error: updateError } = await db
      .from("fixtures")
      .update({
        status,
        kickoff_at: match.utcDate,
        original_kickoff_at: match.utcDate,
        venue: match.venue ?? null,
        referee,
        attendance: match.attendance ?? null,
        home_goals: displayScore?.home ?? null,
        away_goals: displayScore?.away ?? null,
        elapsed_minutes: match.minute,
        went_to_extra_time:
          match.score.duration === "EXTRA_TIME" ||
          match.score.duration === "PENALTY_SHOOTOUT",
      })
      .eq("id", local.id);
    if (updateError) {
      throw new Error(`Updating live fixture ${match.id} failed: ${updateError.message}`);
    }
    report.fixturesUpdated += 1;

    const details = toFixtureProviderDetails(match);
    const { error: detailError } = await db.from("fixture_details").upsert({
      fixture_id: local.id,
      provider_status: details.providerStatus,
      payload: details as unknown as Json,
      fetched_at: new Date().toISOString(),
    });
    if (detailError) {
      throw new Error(`Caching live fixture ${match.id} failed: ${detailError.message}`);
    }

    if (status === "finished") {
      const result = toFixtureResultRow(match);
      const score = predictionScore(match);
      if (score.home !== null && score.away !== null) {
        const { error: resultError } = await db.from("fixture_results").upsert({
          fixture_id: local.id,
          status: result.status,
          home_goals: score.home,
          away_goals: score.away,
          went_to_extra_time: result.went_to_extra_time,
          elapsed_minutes: result.elapsed_minutes,
        });
        if (resultError) {
          throw new Error(`Storing result ${match.id} failed: ${resultError.message}`);
        }
        report.resultsStored += 1;
      }
    }
  }

  if (report.resultsStored > 0) {
    const settlement = await settleDueFixtures();
    report.settledFixtures = settlement.fixturesReleased;
  }
  return report;
}
