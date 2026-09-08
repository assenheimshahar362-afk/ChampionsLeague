-- Give the virtual AI leaderboard player the same long-range season picks and
-- scoring semantics as human players, without requiring a synthetic auth user.
create table public.ai_season_picks (
  season                    integer     primary key,
  champion_candidate_id      integer     not null,
  top_scorer_candidate_id     integer     not null,
  champion_pick_points        smallint    not null check (champion_pick_points between 1 and 2000),
  scorer_pick_points          smallint    not null check (scorer_pick_points between 1 and 500),
  created_at                  timestamptz not null default now(),

  foreign key (season, champion_candidate_id)
    references public.season_team_candidates (season, candidate_id),
  foreign key (season, top_scorer_candidate_id)
    references public.season_player_candidates (season, candidate_id)
);

alter table public.ai_season_picks enable row level security;

-- The points are snapshotted when the pick is made, just like season_picks.
insert into public.ai_season_picks (
  season,
  champion_candidate_id,
  top_scorer_candidate_id,
  champion_pick_points,
  scorer_pick_points
)
select
  champion.season,
  champion.candidate_id,
  scorer.candidate_id,
  champion.pick_points,
  scorer.pick_points
from public.season_team_candidates champion
join public.season_player_candidates scorer
  on scorer.season = champion.season
where champion.season = 2026
  and champion.name_en = 'Arsenal'
  and scorer.name_en = 'Kylian Mbappe';

do $$
begin
  if not exists (
    select 1
    from public.ai_season_picks
    where season = 2026
  ) then
    raise exception 'Could not configure the 2026 AI season pick';
  end if;
end;
$$;

-- Expose only the public-facing pick. The hidden season outcome remains
-- service-role-only and cannot leak before settlement releases it.
create or replace function public.get_visible_ai_season_picks()
returns table (
  season integer,
  champion_awarded_points smallint,
  scorer_awarded_points smallint,
  settled_at timestamptz,
  champion_name_en text,
  champion_name_he text,
  champion_logo_url text,
  scorer_name_en text,
  scorer_name_he text,
  scorer_photo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    picks.season,
    case
      when outcome.released_at is not null
       and champion.team_id = outcome.champion_team_id
        then picks.champion_pick_points
      else 0
    end::smallint,
    case
      when outcome.released_at is not null
       and scorer.football_data_id = any(outcome.top_scorer_football_data_ids)
        then picks.scorer_pick_points
      else 0
    end::smallint,
    outcome.released_at,
    champion.name_en,
    champion.name_he,
    champion.logo_url,
    scorer.name_en,
    scorer.name_he,
    scorer.photo_url
  from public.ai_season_picks picks
  join public.season_team_candidates champion
    on champion.season = picks.season
   and champion.candidate_id = picks.champion_candidate_id
  join public.season_player_candidates scorer
    on scorer.season = picks.season
   and scorer.candidate_id = picks.top_scorer_candidate_id
  left join public.season_outcomes outcome
    on outcome.season = picks.season
  where not public.season_picks_are_open(picks.season)
  order by picks.season desc;
$$;

revoke all on table public.ai_season_picks from public, anon, authenticated;
grant all on table public.ai_season_picks to service_role;

revoke all on function public.get_visible_ai_season_picks()
  from public, anon;
grant execute on function public.get_visible_ai_season_picks()
  to authenticated, service_role;
