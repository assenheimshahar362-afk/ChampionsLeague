"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { FixtureStatus } from "@/lib/fixtures/types";
import { isLivePollCandidate } from "@/lib/ingest/live-window";

const REFRESH_INTERVAL_MS = 30_000;

type LiveRefreshFixture = {
  kickoffAt: string;
  status: FixtureStatus;
};

type LivePollResponse = {
  ok?: boolean;
  report?: {
    fixturesUpdated?: number;
    resultsStored?: number;
    settledFixtures?: number;
  };
};

export function LiveMatchRefresh({
  fixtures,
}: {
  fixtures: LiveRefreshFixture[];
}) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let refreshing = false;
    const refreshLiveData = async () => {
      if (
        document.visibilityState !== "visible" ||
        refreshing ||
        !fixtures.some((fixture) => isLivePollCandidate(fixture))
      ) return;
      refreshing = true;
      try {
        const response = await fetch("/api/matches/live", {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) return;
        const result = (await response.json()) as LivePollResponse;
        const report = result.report;
        const changed =
          (report?.fixturesUpdated ?? 0) > 0 ||
          (report?.resultsStored ?? 0) > 0 ||
          (report?.settledFixtures ?? 0) > 0;
        if (!cancelled && changed) router.refresh();
      } catch {
        // A later interval or online event retries transient network failures.
      } finally {
        refreshing = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshLiveData();
    };

    void refreshLiveData();
    const interval = window.setInterval(refreshLiveData, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("online", refreshLiveData);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("online", refreshLiveData);
    };
  }, [fixtures, router]);

  return null;
}
