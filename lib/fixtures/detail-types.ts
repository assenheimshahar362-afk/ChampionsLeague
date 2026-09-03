import type { FixtureStatus } from "@/lib/fixtures/types";

export type MatchSide = "home" | "away";

export type LineupPlayer = {
  id: number | null;
  name: string;
  number: number | null;
  position: string | null;
  grid: string | null;
};

export type TeamLineup = {
  side: MatchSide;
  teamName: string;
  formation: string | null;
  coachName: string | null;
  coachPhotoUrl: string | null;
  starters: LineupPlayer[];
  substitutes: LineupPlayer[];
};

export type TeamMatchStatistics = {
  side: MatchSide;
  values: Record<string, string | number | null>;
};

export type MatchEvent = {
  minute: number;
  extraMinute: number | null;
  side: MatchSide | null;
  playerName: string | null;
  assistName: string | null;
  type: string;
  detail: string;
};

export type PlayerPerformance = {
  id: number;
  side: MatchSide;
  name: string;
  photoUrl: string | null;
  number: number | null;
  position: string | null;
  minutes: number | null;
  rating: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

export type FixtureProviderDetails = {
  providerStatus: FixtureStatus;
  elapsedMinutes: number | null;
  liveHomeGoals: number | null;
  liveAwayGoals: number | null;
  regulationHomeGoals: number | null;
  regulationAwayGoals: number | null;
  lineups: TeamLineup[];
  statistics: TeamMatchStatistics[];
  events: MatchEvent[];
  playerPerformances: PlayerPerformance[];
};
