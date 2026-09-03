/** Wire types for the Football-Data.org v4 API. */

export type FootballDataMatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "EXTRA_TIME"
  | "PENALTY_SHOOTOUT"
  | "FINISHED"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED"
  | "AWARDED";

export type FootballDataMatchStage =
  | "LEAGUE_STAGE"
  | "GROUP_STAGE"
  | "PLAYOFFS"
  | "LAST_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "FINAL"
  | "PRELIMINARY_ROUND"
  | "QUALIFICATION"
  | "QUALIFICATION_ROUND_1"
  | "QUALIFICATION_ROUND_2"
  | "QUALIFICATION_ROUND_3"
  | "PLAYOFF_ROUND_1"
  | "PLAYOFF_ROUND_2"
  | string;

export type WirePerson = {
  id: number | null;
  name: string | null;
  position?: string | null;
  shirtNumber?: number | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
};

export type WireTeam = {
  area?: { id: number; name: string; code?: string | null; flag?: string | null };
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
  address?: string | null;
  website?: string | null;
  founded?: number | null;
  clubColors?: string | null;
  venue?: string | null;
  coach?: WirePerson | null;
  squad?: WirePerson[];
};

export type WireCompetitionTeamsResponse = {
  count: number;
  filters: Record<string, unknown>;
  competition: { id: number; name: string; code: string };
  season: { id: number; startDate: string; endDate: string };
  teams: WireTeam[];
};

export type WireMatchTeam = {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
  coach?: WirePerson | null;
  formation?: string | null;
  lineup?: WirePerson[];
  bench?: WirePerson[];
  statistics?: Record<string, string | number | null> | null;
};

export type WireScorePair = { home: number | null; away: number | null };

export type WireMatch = {
  id: number;
  utcDate: string;
  status: FootballDataMatchStatus;
  minute: number | null;
  injuryTime?: number | null;
  attendance?: number | null;
  venue?: string | null;
  matchday: number | null;
  stage: FootballDataMatchStage;
  group?: string | null;
  lastUpdated: string;
  homeTeam: WireMatchTeam;
  awayTeam: WireMatchTeam;
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
    fullTime: WireScorePair;
    halfTime: WireScorePair;
    regularTime?: WireScorePair;
    extraTime?: WireScorePair;
    penalties?: WireScorePair;
  };
  goals?: Array<{
    minute: number;
    injuryTime: number | null;
    type: "REGULAR" | "OWN" | "PENALTY" | string;
    team: { id: number; name: string };
    scorer: WirePerson;
    assist: WirePerson | null;
    score: WireScorePair;
  }>;
  bookings?: Array<{
    minute: number;
    team: { id: number; name: string };
    player: WirePerson;
    card: "YELLOW" | "YELLOW_RED" | "RED" | string;
  }>;
  substitutions?: Array<{
    minute: number;
    team: { id: number; name: string };
    playerOut: WirePerson;
    playerIn: WirePerson;
  }>;
  referees?: Array<{
    id: number;
    name: string;
    type: string;
    nationality: string | null;
  }>;
};

export type WireMatchesResponse = {
  filters: Record<string, unknown>;
  resultSet: {
    count: number;
    first?: string;
    last?: string;
    played?: number;
  };
  matches: WireMatch[];
};

export type WireScorer = {
  player: WirePerson & {
    id: number;
    name: string;
    position?: string | null;
  };
  team: Pick<WireTeam, "id" | "name" | "shortName" | "tla" | "crest">;
  playedMatches?: number;
  goals: number;
  assists: number | null;
  penalties?: number | null;
};

export type WireScorersResponse = {
  count: number;
  filters: Record<string, unknown>;
  scorers: WireScorer[];
};
