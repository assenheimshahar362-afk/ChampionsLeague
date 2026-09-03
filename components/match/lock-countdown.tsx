"use client";

import { io } from "next/cache";
import { use, useEffect, useState } from "react";

/**
 * Ticking countdown to a fixture's lock (kickoff).
 *
 * A live clock can advance between the server render and hydration. Only the
 * changing text suppresses that expected one-level mismatch; the browser clock
 * becomes authoritative on the next tick.
 */
export function useCountdown(targetIso: string): number {
  use(io());

  const target = new Date(targetIso).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    // One stable interval per fixture, depending only on the target. Deriving
    // the period from `remaining` would rebuild the timer on every tick.
    // Re-rendering a single span each second is cheaper than that churn.
    const id = setInterval(() => setRemaining(target - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  return remaining;
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0m";

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${Math.ceil(ms / 1000)}s`;
}

export function LockCountdown({
  kickoffAt,
  prefix,
  className,
}: {
  kickoffAt: string;
  prefix: string;
  /**
   * Replaces the default themed colour. Needed on surfaces that are dark in
   * both themes — the hero panel — where `text-muted-foreground` would render
   * dark-on-dark under the light theme.
   */
  className?: string;
}) {
  const remaining = useCountdown(kickoffAt);

  if (remaining <= 0) return null;

  // Under an hour is the window where people actually change their minds.
  const urgent = remaining < 60 * 60 * 1000;

  return (
    <span
      data-numeric
      className={
        className ??
        (urgent ? "text-warning font-medium" : "text-muted-foreground")
      }
    >
      {prefix}{" "}
      {/* Isolated so "2h 37m" keeps its order beside right-to-left text. */}
      <span suppressHydrationWarning dir="ltr">
        {formatRemaining(remaining)}
      </span>
    </span>
  );
}
