"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const MAX_TIMEOUT_MS = 2_147_000_000;

/** Refreshes server data once the next prediction window closes. */
export function KickoffBoundaryRefresh({ kickoffAt }: { kickoffAt?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!kickoffAt) return;

    const delay = Math.max(0, new Date(kickoffAt).getTime() - Date.now() + 250);
    const timeout = window.setTimeout(
      () => router.refresh(),
      Math.min(delay, MAX_TIMEOUT_MS)
    );

    return () => window.clearTimeout(timeout);
  }, [kickoffAt, router]);

  return null;
}
