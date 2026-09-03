import "server-only";

import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import type {
  PlayerPickCandidate,
  TeamPickCandidate,
} from "@/lib/season-picks/types";
import { createClient } from "@/lib/supabase/server";

function isMissingTable(error: { code?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

export type SeasonPickSetup = {
  season: number;
  teams: TeamPickCandidate[];
  players: PlayerPickCandidate[];
  completed: boolean;
  locked: boolean;
  existingPick: {
    championCandidateId: number;
    topScorerCandidateId: number;
  } | null;
};

export async function getSeasonPickSetup(
  userId: string,
  now: number
): Promise<SeasonPickSetup | null> {
  const db = await createClient();
  const { data: latest, error: seasonError } = await db
    .from("season_team_candidates")
    .select("season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (seasonError) {
    if (isMissingTable(seasonError)) {
      throw new SchemaNotReadyError("season_team_candidates");
    }
    throw new Error(`Loading active season failed: ${seasonError.message}`);
  }
  if (!latest) return null;

  const season = latest.season;
  const [teamResult, playerResult, pickResult, firstFixtureResult] = await Promise.all([
    db
      .from("season_team_candidates")
      .select("season, candidate_id, name_en, name_he, logo_url, implied_probability, pick_points, rank")
      .eq("season", season)
      .order("rank"),
    db
      .from("season_player_candidates")
      .select(
        "season, candidate_id, name_en, name_he, photo_url, team_name_en, team_name_he, position, implied_probability, pick_points, rank"
      )
      .eq("season", season)
      .order("rank"),
    db
      .from("season_picks")
      .select("champion_candidate_id, top_scorer_candidate_id")
      .eq("user_id", userId)
      .eq("season", season)
      .maybeSingle(),
    db
      .from("fixtures")
      .select("kickoff_at")
      .eq("season", season)
      .order("kickoff_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const [label, result] of [
    ["team candidates", teamResult],
    ["player candidates", playerResult],
    ["season pick", pickResult],
    ["first fixture", firstFixtureResult],
  ] as const) {
    if (result.error) {
      if (isMissingTable(result.error)) throw new SchemaNotReadyError(label);
      throw new Error(`Loading ${label} failed: ${result.error.message}`);
    }
  }

  const teams = (teamResult.data ?? []).map((candidate) => ({
    season,
    candidateId: candidate.candidate_id,
    nameEn: candidate.name_en,
    nameHe: candidate.name_he,
    logoUrl: candidate.logo_url,
    points: candidate.pick_points,
    probability: candidate.implied_probability,
    rank: candidate.rank,
  }));

  const players = (playerResult.data ?? []).flatMap((candidate) => {
    return [{
      season,
      candidateId: candidate.candidate_id,
      nameEn: candidate.name_en,
      nameHe: candidate.name_he,
      photoUrl: candidate.photo_url,
      teamNameEn: candidate.team_name_en,
      teamNameHe: candidate.team_name_he,
      position: candidate.position,
      points: candidate.pick_points,
      probability: candidate.implied_probability,
      rank: candidate.rank,
    }];
  });

  return {
    season,
    teams,
    players,
    completed: Boolean(pickResult.data),
    locked: Boolean(
      firstFixtureResult.data &&
        new Date(firstFixtureResult.data.kickoff_at).getTime() <= now
    ),
    existingPick: pickResult.data
      ? {
          championCandidateId: pickResult.data.champion_candidate_id,
          topScorerCandidateId: pickResult.data.top_scorer_candidate_id,
        }
      : null,
  };
}
