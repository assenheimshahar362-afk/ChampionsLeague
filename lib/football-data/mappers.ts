import type {
  FixtureProviderDetails,
  LineupPlayer,
  MatchEvent,
  MatchSide,
} from "@/lib/fixtures/detail-types";
import type { FixtureStatus, Stage } from "@/lib/fixtures/types";
import type {
  FootballDataMatchStage,
  FootballDataMatchStatus,
  WireMatch,
  WirePerson,
  WireScorer,
  WireTeam,
} from "@/lib/football-data/types";

const STAGE_MAP: Record<string, Stage> = {
  LEAGUE_STAGE: "league_phase",
  GROUP_STAGE: "league_phase",
  PLAYOFFS: "playoff",
  LAST_16: "r16",
  QUARTER_FINALS: "qf",
  SEMI_FINALS: "sf",
  FINAL: "final",
};

export function stageFromProvider(stage: FootballDataMatchStage): Stage | null {
  return STAGE_MAP[stage] ?? null;
}

export function roundForMatch(match: Pick<WireMatch, "stage" | "matchday" | "group">): string {
  switch (match.stage) {
    case "LEAGUE_STAGE":
      return `League Stage - ${match.matchday ?? 0}`;
    case "GROUP_STAGE":
      return `${match.group ?? "Group Stage"} - ${match.matchday ?? 0}`;
    case "PLAYOFFS":
      return "Knockout Round Play-offs";
    case "LAST_16":
      return "Round of 16";
    case "QUARTER_FINALS":
      return "Quarter-finals";
    case "SEMI_FINALS":
      return "Semi-finals";
    case "FINAL":
      return "Final";
    default:
      return match.stage.replaceAll("_", " ");
  }
}

const STATUS_MAP: Record<FootballDataMatchStatus, FixtureStatus> = {
  SCHEDULED: "scheduled",
  TIMED: "scheduled",
  IN_PLAY: "live",
  PAUSED: "halftime",
  EXTRA_TIME: "live",
  PENALTY_SHOOTOUT: "live",
  FINISHED: "finished",
  SUSPENDED: "live",
  POSTPONED: "postponed",
  CANCELLED: "cancelled",
  AWARDED: "finished",
};

export function mapStatus(status: FootballDataMatchStatus): FixtureStatus {
  return STATUS_MAP[status] ?? "scheduled";
}

const CLUB_TOKENS =
  /\b(FC|CF|AC|SC|BSC|KV|SK|FK|CD|RC|AS|SS|US|BK|IF|AFC|CFC|SV|VFB|VFL|TSG|RB|LOSC|OSC)\b/gi;

export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(CLUB_TOKENS, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function shortNameFor(team: Pick<WireTeam, "name" | "shortName">): string {
  const supplied = team.shortName?.trim();
  if (supplied) return supplied;
  const compact = team.name.replace(CLUB_TOKENS, " ").replace(/\s+/g, " ").trim();
  return compact || team.name;
}

export function codeFor(name: string, tla: string | null): string {
  if (tla && /^[A-Za-z]{2,4}$/.test(tla.trim())) return tla.trim().toUpperCase();
  const letters = name.normalize("NFD").replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 3) || "UNK").toUpperCase();
}

export function colorFor(providerId: number): string {
  let hash = Math.imul(providerId, 2654435761);
  hash ^= hash >>> 13;
  hash = Math.abs(hash);
  return hslToHex(hash % 360, 55 + (hash % 20), 38 + (hash % 12));
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const sat = saturation / 100;
  const lig = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const channel = (n: number) =>
    lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (value: number) =>
    Math.round(value * 255).toString(16).padStart(2, "0");
  return `#${hex(channel(0))}${hex(channel(8))}${hex(channel(4))}`;
}

export type TeamRow = {
  football_data_id: number;
  name: string;
  short_name: string;
  code: string;
  color: string;
  country: string;
  logo_url: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_capacity: number | null;
};

export function toTeamRow(team: WireTeam): TeamRow {
  return {
    football_data_id: team.id,
    name: team.name,
    short_name: shortNameFor(team),
    code: codeFor(team.name, team.tla),
    color: colorFor(team.id),
    country: team.area?.name ?? "Unknown",
    logo_url: team.crest || null,
    venue_name: team.venue ?? null,
    venue_city: null,
    venue_capacity: null,
  };
}

export type FixtureRow = {
  football_data_id: number;
  stage: Stage;
  round: string;
  matchday: number | null;
  kickoff_at: string;
  original_kickoff_at: string;
  venue: string | null;
  referee: string | null;
  attendance: number | null;
  home_team_provider_id: number;
  away_team_provider_id: number;
};

export type FixtureResultRow = {
  football_data_id: number;
  status: FixtureStatus;
  home_goals: number | null;
  away_goals: number | null;
  went_to_extra_time: boolean;
  elapsed_minutes: number | null;
};

export function regulationScore(match: WireMatch) {
  return match.score.regularTime ?? match.score.fullTime;
}

/**
 * The scoreline predictions are settled against.
 *
 * League-phase predictions use the score after 90 minutes. Knockout
 * predictions include extra time, while shootout kicks stay excluded because
 * Football-Data exposes them separately from `fullTime`.
 */
export function predictionScore(match: WireMatch) {
  const stage = stageFromProvider(match.stage);
  const isKnockout = stage !== null && stage !== "league_phase";
  return isKnockout ? match.score.fullTime : regulationScore(match);
}

export function toFixtureRow(match: WireMatch, kickoffAt: string): FixtureRow | null {
  const stage = stageFromProvider(match.stage);
  if (!stage) return null;
  return {
    football_data_id: match.id,
    stage,
    round: roundForMatch(match),
    matchday: stage === "league_phase" ? match.matchday : null,
    kickoff_at: kickoffAt,
    original_kickoff_at: match.utcDate,
    venue: match.venue ?? null,
    referee:
      match.referees?.find((referee) => referee.type === "REFEREE")?.name ??
      match.referees?.[0]?.name ??
      null,
    attendance: match.attendance ?? null,
    home_team_provider_id: match.homeTeam.id,
    away_team_provider_id: match.awayTeam.id,
  };
}

export function toFixtureResultRow(match: WireMatch): FixtureResultRow {
  const score = predictionScore(match);
  return {
    football_data_id: match.id,
    status: mapStatus(match.status),
    home_goals: score.home,
    away_goals: score.away,
    went_to_extra_time:
      match.score.duration === "EXTRA_TIME" ||
      match.score.duration === "PENALTY_SHOOTOUT",
    elapsed_minutes: match.minute,
  };
}

function sideForTeam(match: WireMatch, teamId: number): MatchSide | null {
  if (teamId === match.homeTeam.id) return "home";
  if (teamId === match.awayTeam.id) return "away";
  return null;
}

function lineupPlayer(person: WirePerson): LineupPlayer {
  return {
    id: person.id,
    name: person.name ?? "Unknown",
    number: person.shirtNumber ?? null,
    position: person.position ?? null,
    grid: null,
  };
}

function eventsFor(match: WireMatch): MatchEvent[] {
  const goals: MatchEvent[] = (match.goals ?? []).map((goal) => ({
    minute: goal.minute,
    extraMinute: goal.injuryTime,
    side: sideForTeam(match, goal.team.id),
    playerName: goal.scorer.name,
    assistName: goal.assist?.name ?? null,
    type: "Goal",
    detail: goal.type,
  }));
  const bookings: MatchEvent[] = (match.bookings ?? []).map((booking) => ({
    minute: booking.minute,
    extraMinute: null,
    side: sideForTeam(match, booking.team.id),
    playerName: booking.player.name,
    assistName: null,
    type: "Card",
    detail: booking.card,
  }));
  const substitutions: MatchEvent[] = (match.substitutions ?? []).map((sub) => ({
    minute: sub.minute,
    extraMinute: null,
    side: sideForTeam(match, sub.team.id),
    playerName: sub.playerOut.name,
    assistName: sub.playerIn.name,
    type: "subst",
    detail: "Substitution",
  }));
  return [...goals, ...bookings, ...substitutions].sort(
    (a, b) => a.minute - b.minute || (a.extraMinute ?? 0) - (b.extraMinute ?? 0)
  );
}

export function toFixtureProviderDetails(match: WireMatch): FixtureProviderDetails {
  const regulation = regulationScore(match);
  const teams: Array<[MatchSide, WireMatch["homeTeam"]]> = [
    ["home", match.homeTeam],
    ["away", match.awayTeam],
  ];
  return {
    providerStatus: mapStatus(match.status),
    elapsedMinutes: match.minute,
    liveHomeGoals: match.score.fullTime.home,
    liveAwayGoals: match.score.fullTime.away,
    regulationHomeGoals: regulation.home,
    regulationAwayGoals: regulation.away,
    lineups: teams.flatMap(([side, team]) => {
      if ((team.lineup?.length ?? 0) === 0 && (team.bench?.length ?? 0) === 0) {
        return [];
      }
      return [{
        side,
        teamName: team.name,
        formation: team.formation ?? null,
        coachName: team.coach?.name ?? null,
        coachPhotoUrl: null,
        starters: (team.lineup ?? []).map(lineupPlayer),
        substitutes: (team.bench ?? []).map(lineupPlayer),
      }];
    }),
    statistics: teams.flatMap(([side, team]) =>
      team.statistics ? [{ side, values: team.statistics }] : []
    ),
    events: eventsFor(match),
    // Football-Data exposes team statistics but not per-player match ratings.
    playerPerformances: [],
  };
}

export function scorerToCandidate(
  scorer: WireScorer,
  rank: number
) {
  return {
    footballDataId: scorer.player.id,
    name: scorer.player.name,
    teamApiId: scorer.team.id,
    position: scorer.player.position ?? null,
    goals: scorer.goals,
    assists: scorer.assists ?? 0,
    rating: null,
    scorerRank: rank,
    assistRank: null,
  };
}
