"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 30_000;

export function LiveMatchRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let refreshing = false;
    const refreshLiveData = async () => {
      if (document.visibilityState !== "visible" || refreshing) return;
      refreshing = true;
      try {
        await fetch("/api/matches/live", { method: "POST", cache: "no-store" });
      } catch {
        // A later interval or online event retries transient network failures.
      } finally {
        refreshing = false;
        if (!cancelled) router.refresh();
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
  }, [enabled, router]);

  return null;
}
