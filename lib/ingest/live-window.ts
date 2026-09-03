import type { FixtureStatus } from "@/lib/fixtures/types";

export const LIVE_POLL_LEAD_MS = 15 * 60_000;
export const LIVE_POLL_TAIL_MS = 4 * 60 * 60_000;

export function isLivePollCandidate(
  fixture: { status: FixtureStatus; kickoffAt: string },
  now: number = Date.now()
): boolean {
  if (fixture.status === "live" || fixture.status === "halftime") return true;
  if (fixture.status !== "scheduled" && fixture.status !== "postponed") {
    return false;
  }
  const distance = now - new Date(fixture.kickoffAt).getTime();
  return distance >= -LIVE_POLL_LEAD_MS && distance <= LIVE_POLL_TAIL_MS;
}
