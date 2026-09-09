-- Keep every unresolved season pick aligned with the points currently assigned
-- to its candidate. Candidate prices may be edited directly in the database as
-- well as through the admin RPCs, so enforcing this at the table boundary keeps
-- the profile display and the eventual settlement award on the same value.

create or replace function public.sync_team_candidate_pick_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.season_picks
  set champion_pick_points = new.pick_points
  where season = new.season
    and champion_candidate_id = new.candidate_id
    and settled_at is null;

  update public.ai_season_picks picks
  set champion_pick_points = new.pick_points
  where picks.season = new.season
    and picks.champion_candidate_id = new.candidate_id
    and not exists (
      select 1
      from public.season_outcomes outcome
      where outcome.season = picks.season
        and outcome.released_at is not null
    );

  return new;
end;
$$;

create or replace function public.sync_player_candidate_pick_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.season_picks
  set scorer_pick_points = new.pick_points
  where season = new.season
    and top_scorer_candidate_id = new.candidate_id
    and settled_at is null;

  update public.ai_season_picks picks
  set scorer_pick_points = new.pick_points
  where picks.season = new.season
    and picks.top_scorer_candidate_id = new.candidate_id
    and not exists (
      select 1
      from public.season_outcomes outcome
      where outcome.season = picks.season
        and outcome.released_at is not null
    );

  return new;
end;
$$;

create trigger season_team_candidates_sync_pick_points
  after update of pick_points on public.season_team_candidates
  for each row
  when (old.pick_points is distinct from new.pick_points)
  execute function public.sync_team_candidate_pick_points();

create trigger season_player_candidates_sync_pick_points
  after update of pick_points on public.season_player_candidates
  for each row
  when (old.pick_points is distinct from new.pick_points)
  execute function public.sync_player_candidate_pick_points();

-- Repair drift that predates the triggers. Settled picks remain immutable
-- because their awarded points already belong to a completed competition.
update public.season_picks picks
set champion_pick_points = candidate.pick_points
from public.season_team_candidates candidate
where picks.season = candidate.season
  and picks.champion_candidate_id = candidate.candidate_id
  and picks.settled_at is null
  and picks.champion_pick_points is distinct from candidate.pick_points;

update public.season_picks picks
set scorer_pick_points = candidate.pick_points
from public.season_player_candidates candidate
where picks.season = candidate.season
  and picks.top_scorer_candidate_id = candidate.candidate_id
  and picks.settled_at is null
  and picks.scorer_pick_points is distinct from candidate.pick_points;

update public.ai_season_picks picks
set champion_pick_points = candidate.pick_points
from public.season_team_candidates candidate
where picks.season = candidate.season
  and picks.champion_candidate_id = candidate.candidate_id
  and picks.champion_pick_points is distinct from candidate.pick_points
  and not exists (
    select 1
    from public.season_outcomes outcome
    where outcome.season = picks.season
      and outcome.released_at is not null
  );

update public.ai_season_picks picks
set scorer_pick_points = candidate.pick_points
from public.season_player_candidates candidate
where picks.season = candidate.season
  and picks.top_scorer_candidate_id = candidate.candidate_id
  and picks.scorer_pick_points is distinct from candidate.pick_points
  and not exists (
    select 1
    from public.season_outcomes outcome
    where outcome.season = picks.season
      and outcome.released_at is not null
  );

revoke all on function public.sync_team_candidate_pick_points()
  from public, anon, authenticated;
revoke all on function public.sync_player_candidate_pick_points()
  from public, anon, authenticated;
