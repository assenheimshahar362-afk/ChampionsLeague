"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 60_000;

export function LiveMatchRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const refreshLiveData = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await fetch("/api/matches/live", { method: "POST", cache: "no-store" });
      } finally {
        if (!cancelled) router.refresh();
      }
    };

    void refreshLiveData();
    const interval = window.setInterval(refreshLiveData, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, router]);

  return null;
}
