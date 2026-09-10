-- Collapse the profile header, counters and latest season pick into one
-- database round trip. The function runs with the caller's RLS identity and
-- can therefore only return the authenticated user's own rows.
create or replace function public.get_my_profile_overview(
  request_now timestamptz default now()
)
returns table (
  display_name text,
  avatar_url text,
  nickname_confirmed_at timestamptz,
  profile_created_at timestamptz,
  prediction_count bigint,
  match_points bigint,
  group_count bigint,
  pick_season integer,
  pick_locked boolean,
  champion_candidate_id integer,
  champion_name_en text,
  champion_name_he text,
  champion_logo_url text,
  scorer_candidate_id integer,
  scorer_name_en text,
  scorer_name_he text,
  scorer_photo_url text,
  scorer_team_name_en text,
  scorer_team_name_he text,
  champion_pick_points smallint,
  scorer_pick_points smallint,
  champion_awarded_points smallint,
  scorer_awarded_points smallint,
  pick_settled_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    profile.display_name,
    profile.avatar_url,
    profile.nickname_confirmed_at,
    profile.created_at,
    (select count(*) from public.predictions where user_id = auth.uid()),
    coalesce((
      select sum(score.total_points)
      from public.prediction_scores score
      where score.user_id = auth.uid()
    ), 0),
    (select count(*) from public.group_members where user_id = auth.uid()),
    pick.season,
    case
      when pick.season is null then false
      else coalesce(first_fixture.kickoff_at <= request_now, false)
    end,
    champion.candidate_id,
    champion.name_en,
    champion.name_he,
    champion.logo_url,
    scorer.candidate_id,
    scorer.name_en,
    scorer.name_he,
    scorer.photo_url,
    scorer.team_name_en,
    scorer.team_name_he,
    pick.champion_pick_points,
    pick.scorer_pick_points,
    pick.champion_awarded_points,
    pick.scorer_awarded_points,
    pick.settled_at
  from public.profiles profile
  left join lateral (
    select latest.*
    from public.season_picks latest
    where latest.user_id = auth.uid()
    order by latest.season desc
    limit 1
  ) pick on true
  left join public.season_team_candidates champion
    on champion.season = pick.season
   and champion.candidate_id = pick.champion_candidate_id
  left join public.season_player_candidates scorer
    on scorer.season = pick.season
   and scorer.candidate_id = pick.top_scorer_candidate_id
  left join lateral (
    select fixture.kickoff_at
    from public.fixtures fixture
    where fixture.season = pick.season
    order by fixture.kickoff_at
    limit 1
  ) first_fixture on true
  where profile.id = auth.uid();
$$;

revoke all on function public.get_my_profile_overview(timestamptz)
  from public, anon;
grant execute on function public.get_my_profile_overview(timestamptz)
  to authenticated;

-- Managers need member email addresses for payment administration. Resolve
-- them in one verified database call instead of one Auth Admin HTTP request
-- per member. A row is returned only for groups managed by the caller.
create or replace function public.get_my_group_member_emails(
  target_group_ids uuid[]
)
returns table (
  group_id uuid,
  user_id uuid,
  email text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with managed_groups as (
    select membership.group_id
    from public.group_members membership
    where membership.user_id = auth.uid()
      and membership.role = 'manager'
      and membership.group_id = any(target_group_ids)
  ), visible_users as (
    select member.group_id, member.user_id
    from public.group_members member
    join managed_groups managed on managed.group_id = member.group_id
    union
    select request.group_id, request.user_id
    from public.group_join_requests request
    join managed_groups managed on managed.group_id = request.group_id
    where request.status = 'pending_payment'
  )
  select visible.group_id, visible.user_id, account.email::text
  from visible_users visible
  join auth.users account on account.id = visible.user_id;
$$;

revoke all on function public.get_my_group_member_emails(uuid[])
  from public, anon;
grant execute on function public.get_my_group_member_emails(uuid[])
  to authenticated;

notify pgrst, 'reload schema';
