-- ============================================================================
-- BASE SCHEMA
-- ============================================================================
-- 0001_init.sql
--
-- DESTRUCTIVE RESET: the whole application schema, in one migration.
--
-- Running this file drops and recreates the complete public schema. All game
-- data is erased. Supabase Auth accounts are preserved, and their profiles are
-- rebuilt from Auth metadata so those accounts remain usable.
--
-- Order is load-bearing: teams precedes profiles so the favourite-team foreign
-- key can be declared inline rather than bolted on with a later ALTER, and
-- fixtures precedes everything that references a fixture.
--
-- Two rules run through the whole file:
--
--   * Reference data (teams, fixtures) is world-readable and client-unwritable.
--     Ingestion writes it under the service role, which bypasses RLS, so no
--     INSERT/UPDATE/DELETE policy exists for it anywhere.
--   * User data is governed by RLS, not by application code. The prediction
--     lock and the blind-play rule are policies, because Server Functions are
--     reachable by direct POST and the database has to be the backstop.

begin;

-- The trigger lives on auth.users, outside public, so remove it explicitly
-- before dropping the function it calls with the rest of the schema.
drop trigger if exists on_auth_user_created on auth.users;
drop schema if exists public cascade;
create schema public authorization postgres;

grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

create extension if not exists "pgcrypto";

-- ============================================================== utilities ==

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ================================================================== enums ==

-- Mirrors the `Stage` union in lib/fixtures/types.ts. The four qualifying
-- rounds are absent on purpose: they have no Stage and are dropped at ingest,
-- which is what reduces a season's 279 fixtures to the 189 of the competition
-- proper.
create type public.fixture_stage as enum (
  'league_phase',
  'playoff',
  'r16',
  'qf',
  'sf',
  'final'
);

-- Mirrors `FixtureStatus` in lib/fixtures/types.ts.
create type public.fixture_status as enum (
  'scheduled',
  'live',
  'halftime',
  'finished',
  'postponed',
  'cancelled'
);

-- ================================================================== teams ==

create table public.teams (
  id               uuid primary key default gen_random_uuid(),
  -- Legacy provider ids remain nullable for audit/history. New ingestion uses
  -- Football-Data.org ids, which are stable across seasons.
  api_football_id  integer     unique,
  football_data_id integer     unique,
  name             text        not null check (char_length(trim(name)) > 0),
  -- Synthesised by lib/football-data/mappers.ts when the provider omits it.
  short_name       text        not null,
  code             text        not null check (char_length(code) between 2 and 4),
  -- Fallback crest colour for the monogram when logo_url is null or 404s.
  color            text        not null check (color ~ '^#[0-9a-f]{6}$'),
  country          text        not null,
  logo_url         text,
  venue_name       text,
  venue_city       text,
  venue_capacity   integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.teams is
  'Clubs from Football-Data.org. Written only by the ingestion job.';
comment on column public.teams.api_football_id is
  'Deprecated legacy API-Football id.';
comment on column public.teams.football_data_id is
  'Natural team id from Football-Data.org v4.';
comment on column public.teams.color is
  'Deterministic fallback colour derived from the provider id, not a real club colour.';

create trigger teams_set_updated_at
  before update on public.teams
  for each row
  execute function public.set_updated_at();

-- =============================================================== profiles ==

-- The user-facing mirror of auth.users. Created automatically on signup so no
-- code path ever has to cope with a signed-in user that has no profile row.
--
-- Profiles are readable by signed-in players so leaderboard rows can show a
-- name and avatar. Email addresses remain private in auth.users.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text        not null check (
                              char_length(trim(display_name)) between 1 and 40
                            ),
  avatar_url    text,
  favorite_team_id uuid     references public.teams (id) on delete set null,
  locale        text        not null default 'en'
                              check (locale in ('en', 'he')),
  nickname_confirmed_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile per auth user. Auto-created by handle_new_user() and readable by signed-in players.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Nicknames identify people everywhere in the app, so case-only duplicates
-- are not allowed ("Shahar" and "shahar" are the same nickname).
create unique index profiles_display_name_unique_idx
  on public.profiles (lower(display_name));

-- Runs as SECURITY DEFINER because it writes to public.profiles during signup,
-- when there is no authenticated role yet to satisfy the RLS insert policy.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  -- This is only a collision-safe provisional value. Every authentication
  -- method must still confirm a public nickname in onboarding.
  candidate := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Player'
  );

  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(candidate, 31) || '-' || left(new.id::text, 8)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Rebuild one profile for every existing Auth account. Manually edited profile
-- fields are intentionally reset with the rest of public. These collision-safe
-- names are provisional; onboarding replaces them with user-chosen nicknames.
insert into public.profiles (id, display_name)
select
  u.id,
  left(coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Player'
  ), 31) || '-' || left(u.id::text, 8)
from auth.users u;

-- ================================================================= groups ==

create type public.group_member_role as enum ('member', 'manager');

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null check (char_length(trim(name)) between 1 and 60),
  created_by  uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.group_members (
  group_id    uuid not null references public.groups (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.group_member_role not null default 'member',
  joined_at   timestamptz not null default now(),

  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create trigger groups_set_updated_at
  before update on public.groups
  for each row
  execute function public.set_updated_at();

-- Ownership is assigned at creation. Managers may rename or delete a group,
-- but cannot transfer its creator field through a crafted PostgREST update.
create or replace function public.prevent_group_creator_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by <> old.created_by then
    raise exception 'group creator cannot be changed';
  end if;
  return new;
end;
$$;

create trigger groups_keep_creator
  before update of created_by on public.groups
  for each row
  execute function public.prevent_group_creator_change();

-- These helpers run as the function owner so group-member RLS policies do not
-- recurse into themselves while checking membership.
create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id and gm.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
      and gm.role = 'manager'
  );
$$;

create or replace function public.add_group_creator_as_manager()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'manager');
  return new;
end;
$$;

create trigger groups_add_creator
  after insert on public.groups
  for each row
  execute function public.add_group_creator_as_manager();

-- =============================================================== fixtures ==

create table public.fixtures (
  id                   uuid primary key default gen_random_uuid(),
  api_football_id      integer     unique,
  football_data_id     integer     unique,
  season               integer     not null,
  stage                public.fixture_stage not null,
  -- The provider's round label, stored verbatim and never re-derived.
  round                text        not null,
  -- 1-8 during the league phase, null in the knockout rounds.
  matchday             smallint    check (matchday between 1 and 8),

  -- The kickoff the app treats as real. Equal to original_kickoff_at unless
  -- the season is being replayed; see lib/fixtures/rebase.ts.
  kickoff_at           timestamptz not null,
  -- The provider's untouched kickoff, so a rebase stays auditable and
  -- reversible. Always the truth about when the match was actually played.
  original_kickoff_at  timestamptz not null,

  venue                text,
  venue_api_id         integer,
  venue_city           text,
  venue_address        text,
  venue_capacity       integer check (venue_capacity is null or venue_capacity > 0),
  venue_surface        text,
  venue_image_url      text,
  attendance           integer check (attendance is null or attendance >= 0),
  referee              text,
  home_team_id         uuid        not null references public.teams (id),
  away_team_id         uuid        not null references public.teams (id),

  status               public.fixture_status not null default 'scheduled',

  -- Regulation-time score (§6.3). NULL until settlement releases it — the
  -- result of a replayed season is known at ingest, so writing it here early
  -- would show every user the answer before they predicted. The real value
  -- waits in public.fixture_results.
  home_goals           smallint    check (home_goals >= 0),
  away_goals           smallint    check (away_goals >= 0),
  went_to_extra_time   boolean     not null default false,
  elapsed_minutes      smallint,

  -- Difficulty inputs (§6.2), snapshotted at ingest so the multiplier a user
  -- saw while predicting is the multiplier they are settled against.
  --
  -- odds_*  : decimal odds, when the plan exposes them (season 2024 does not).
  -- prob_*  : outcome probabilities actually used — de-margined odds when
  --           available, otherwise the ratings model in lib/scoring/ratings.ts.
  odds_home            numeric(6, 3) check (odds_home > 1),
  odds_draw            numeric(6, 3) check (odds_draw > 1),
  odds_away            numeric(6, 3) check (odds_away > 1),
  prob_home            numeric(5, 4) check (prob_home between 0 and 1),
  prob_draw            numeric(5, 4) check (prob_draw between 0 and 1),
  prob_away            numeric(5, 4) check (prob_away between 0 and 1),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint fixtures_teams_differ check (home_team_id <> away_team_id),
  -- A league-phase fixture always has a matchday; a knockout fixture never does.
  constraint fixtures_matchday_matches_stage check (
    (stage = 'league_phase' and matchday is not null)
    or (stage <> 'league_phase' and matchday is null)
  ),
  -- Goals arrive as a pair or not at all; a half-populated score would settle
  -- predictions against a phantom result.
  constraint fixtures_goals_paired check (
    (home_goals is null) = (away_goals is null)
  )
);

comment on table public.fixtures is
  'Fixture list from Football-Data.org. Goals stay NULL until settlement releases them.';
comment on column public.fixtures.api_football_id is
  'Deprecated legacy API-Football id.';
comment on column public.fixtures.football_data_id is
  'Natural match id from Football-Data.org v4.';
comment on column public.fixtures.kickoff_at is
  'Effective kickoff, possibly rebased. The prediction lock is measured against this.';

create trigger fixtures_set_updated_at
  before update on public.fixtures
  for each row
  execute function public.set_updated_at();

-- The matchday list orders by kickoff and filters by status; the settlement
-- job scans for fixtures whose kickoff has passed.
create index fixtures_kickoff_at_idx on public.fixtures (kickoff_at);
create index fixtures_status_kickoff_idx on public.fixtures (status, kickoff_at);
create index fixtures_season_stage_idx on public.fixtures (season, stage, matchday);
create index fixtures_home_team_idx on public.fixtures (home_team_id);
create index fixtures_away_team_idx on public.fixtures (away_team_id);

-- ========================================================= AI predictions ==

-- One generated analysis per fixture. The service role is the only writer;
-- visitors read the same cached prediction instead of triggering model calls.
create table public.ai_match_predictions (
  fixture_id              uuid primary key
                            references public.fixtures (id) on delete cascade,
  predicted_home_goals    smallint not null check (predicted_home_goals between 0 and 6),
  predicted_away_goals    smallint not null check (predicted_away_goals between 0 and 6),
  home_win_probability    smallint not null check (home_win_probability between 0 and 100),
  draw_probability        smallint not null check (draw_probability between 0 and 100),
  away_win_probability    smallint not null check (away_win_probability between 0 and 100),
  confidence              smallint not null check (confidence between 0 and 100),
  summary_en              text not null check (char_length(trim(summary_en)) between 1 and 500),
  summary_he              text not null check (char_length(trim(summary_he)) between 1 and 500),
  key_factors_en          jsonb not null check (
                            jsonb_typeof(key_factors_en) = 'array'
                            and jsonb_array_length(key_factors_en) = 3
                          ),
  key_factors_he          jsonb not null check (
                            jsonb_typeof(key_factors_he) = 'array'
                            and jsonb_array_length(key_factors_he) = 3
                          ),
  model                   text not null,
  source_snapshot         jsonb not null,
  generated_at            timestamptz not null default now(),

  constraint ai_match_predictions_probabilities_total check (
    home_win_probability + draw_probability + away_win_probability = 100
  )
);

comment on table public.ai_match_predictions is
  'Cached entertainment-only AI analysis generated from stored fixture data.';

create table public.fixture_recent_form (
  fixture_id    uuid primary key
                  references public.fixtures (id) on delete cascade,
  home_matches  jsonb not null check (jsonb_typeof(home_matches) = 'array'),
  away_matches  jsonb not null check (jsonb_typeof(away_matches) = 'array'),
  home_lineup   jsonb,
  away_lineup   jsonb,
  fetched_at    timestamptz not null default now()
);

comment on table public.fixture_recent_form is
  'Cached pre-match results from Football-Data.org, shared by match pages and AI analysis.';

-- ======================================================== fixture results ==

-- The withheld result of a fixture.
--
-- Why this table exists: the app is developed against season 2024, which has
-- already been played, so ingest knows every score up front. Writing those
-- straight into public.fixtures would show every user the answer to a match
-- they have not predicted yet. The result is parked here instead and released
-- into public.fixtures by the settlement job once the (possibly rebased)
-- kickoff has passed.
--
-- The same table is the seam that makes the 2026/27 switch a config change: for
-- a live season the live-score poll writes these rows as matches finish, and
-- settlement reads them exactly as it does now. Only the row's source differs —
-- never the settlement code.
--
-- SECURITY: RLS is enabled below and NO policy is defined for this table. That
-- is the point. With RLS on and no policy, anon and authenticated see nothing
-- at all; only the service role can read or write. Adding a SELECT policy here
-- would leak unplayed results and break the game.
create table public.fixture_results (
  fixture_id          uuid primary key
                        references public.fixtures (id) on delete cascade,

  status              public.fixture_status not null,

  -- Regulation-time score (§6.3), taken from the provider's `score.fulltime`.
  --
  -- NOT from its `goals` field, which folds in extra time: in season 2024,
  -- Inter-Barcelona reads goals 4-3 but fulltime 3-3, and PSV-Juventus reads
  -- goals 3-1 but fulltime 2-1. Settling on `goals` would award the wrong
  -- outcome on both.
  home_goals          smallint check (home_goals >= 0),
  away_goals          smallint check (away_goals >= 0),

  -- Display-only on knockout ties. Never an input to scoring.
  went_to_extra_time  boolean     not null default false,
  elapsed_minutes     smallint,

  -- Set when the settlement job has copied this row into public.fixtures and
  -- scored the predictions against it. Makes settlement idempotent and gives a
  -- cheap way to find work still outstanding.
  released_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint fixture_results_goals_paired check (
    (home_goals is null) = (away_goals is null)
  )
);

comment on table public.fixture_results is
  'Withheld regulation-time results. Service-role only: no RLS policy exists by design.';
comment on column public.fixture_results.released_at is
  'When settlement copied this into public.fixtures. NULL means still pending.';

create trigger fixture_results_set_updated_at
  before update on public.fixture_results
  for each row
  execute function public.set_updated_at();

-- The settlement job's working query: unreleased results whose fixture has
-- kicked off. Partial, because released rows are never scanned again.
create index fixture_results_pending_idx
  on public.fixture_results (fixture_id)
  where released_at is null;

-- ======================================================== fixture details ==

-- Server-only normalized provider snapshots. Deep fields are optional by
-- subscription and cached so page views do not consume provider quota.
create table public.fixture_details (
  fixture_id       uuid primary key
                     references public.fixtures (id) on delete cascade,
  provider_status  public.fixture_status not null,
  payload          jsonb not null,
  fetched_at       timestamptz not null default now()
);

comment on table public.fixture_details is
  'Server-managed cache of detailed Football-Data.org match data.';

-- ========================================================== season picks ==

-- Candidate prices are generated once during season ingest and then frozen.
-- That keeps the reward a player saw while choosing from changing later.
create table public.season_team_candidates (
  season               integer       not null,
  candidate_id         integer       generated by default as identity,
  football_data_id     integer,
  team_id              uuid          references public.teams (id) on delete set null,
  name_en              text          not null check (char_length(trim(name_en)) between 1 and 100),
  name_he              text          not null check (char_length(trim(name_he)) between 1 and 100),
  logo_url             text,
  implied_probability  numeric(7, 6) not null
                         check (implied_probability > 0 and implied_probability <= 1),
  pick_points          smallint      not null check (pick_points between 1 and 2000),
  rank                 smallint      not null check (rank between 1 and 200),
  created_at           timestamptz   not null default now(),

  primary key (season, candidate_id),
  unique (season, football_data_id),
  unique (season, name_en),
  unique (season, rank)
);

-- Curated 2026/27 champion market. The source values are betting odds;
-- pick_points is their nearest integer (7.50 -> 8).
with team_market(rank, name_en, name_he, odds) as (
  values
    (1, 'PSG', 'פריז סן-ז''רמן', 6.00),
    (2, 'Arsenal', 'ארסנל', 7.00),
    (3, 'Bayern Munich', 'באיירן מינכן', 7.00),
    (4, 'Barcelona', 'ברצלונה', 7.00),
    (5, 'Real Madrid', 'ריאל מדריד', 7.50),
    (6, 'Man City', 'מנצ''סטר סיטי', 10.00),
    (7, 'Liverpool', 'ליברפול', 13.00),
    (8, 'Man Utd', 'מנצ''סטר יונייטד', 21.00),
    (9, 'Inter Milan', 'אינטר מילאנו', 29.00),
    (10, 'Atletico Madrid', 'אתלטיקו מדריד', 34.00),
    (11, 'Aston Villa', 'אסטון וילה', 41.00),
    (12, 'Borussia Dortmund', 'בורוסיה דורטמונד', 41.00),
    (13, 'Roma', 'רומא', 41.00),
    (14, 'Napoli', 'נאפולי', 41.00),
    (15, 'Real Betis', 'ריאל בטיס', 51.00),
    (16, 'Villarreal', 'ויאריאל', 51.00),
    (17, 'RB Leipzig', 'ר.ב. לייפציג', 51.00),
    (18, 'Como', 'קומו', 81.00),
    (19, 'FC Porto', 'פורטו', 81.00),
    (20, 'VfB Stuttgart', 'שטוטגרט', 67.00),
    (21, 'Sporting', 'ספורטינג', 101.00),
    (22, 'Lens', 'לאנס', 126.00),
    (23, 'PSV', 'פ.ס.וו. איינדהובן', 126.00),
    (24, 'Bodo/Glimt', 'בודו/גלימט', 126.00),
    (25, 'Lille', 'ליל', 151.00),
    (26, 'Feyenoord', 'פיינורד', 151.00),
    (27, 'Galatasaray', 'גלאטסראיי', 151.00),
    (28, 'Fenerbahce', 'פנרבחצ''ה', 151.00),
    (29, 'Club Brugge', 'קלאב ברוז''', 201.00),
    (30, 'Shakhtar Donetsk', 'שחטאר דונצק', 251.00),
    (31, 'AEK Athens', 'א.א.ק. אתונה', 251.00),
    (32, 'Viking FK', 'ויקינג', 301.00),
    (33, 'Slavia Prague', 'סלביה פראג', 351.00),
    (34, 'Slovan Bratislava', 'סלובן ברטיסלאבה', 501.00),
    (35, 'LASK Linz', 'לאסק לינץ', 751.00),
    (36, 'Sabah', 'סבאח', 1001.00)
)
insert into public.season_team_candidates (
  season,
  candidate_id,
  name_en,
  name_he,
  implied_probability,
  pick_points,
  rank
)
select
  2026,
  rank,
  name_en,
  name_he,
  least(1, 1 / odds),
  round(odds)::smallint,
  rank
from team_market;

select setval(
  pg_get_serial_sequence('public.season_team_candidates', 'candidate_id'),
  (select max(candidate_id) from public.season_team_candidates)
);

create table public.season_player_candidates (
  season               integer       not null,
  candidate_id         integer       generated by default as identity,
  football_data_id     integer,
  name_en              text          not null check (char_length(trim(name_en)) between 1 and 100),
  name_he              text          not null check (char_length(trim(name_he)) between 1 and 100),
  photo_url            text,
  team_id              uuid          references public.teams (id) on delete set null,
  team_name_en         text          not null check (char_length(trim(team_name_en)) between 1 and 100),
  team_name_he         text          not null check (char_length(trim(team_name_he)) between 1 and 100),
  position             text,
  source_goals         smallint      not null default 0 check (source_goals >= 0),
  source_assists       smallint      not null default 0 check (source_assists >= 0),
  source_rating        numeric(4, 2) check (source_rating between 0 and 10),
  implied_probability  numeric(7, 6) not null
                         check (implied_probability > 0 and implied_probability <= 1),
  pick_points          smallint      not null check (pick_points between 1 and 500),
  rank                 smallint      not null check (rank between 1 and 200),
  created_at           timestamptz   not null default now(),

  primary key (season, candidate_id),
  unique (season, football_data_id),
  unique (season, name_en),
  unique (season, rank)
);

-- Curated 2026/27 top-scorer market. The source values are betting odds;
-- pick_points is their nearest integer (4.50 -> 5). Provider ids and team
-- foreign keys are enriched later without changing the published prices.
with player_market(rank, name_en, name_he, team_name_en, team_name_he, odds, photo_url) as (
  values
    (1, 'Kylian Mbappe', 'קיליאן אמבפה', 'Real Madrid', 'ריאל מדריד', 4.50, null),
    (2, 'Erling Haaland', 'ארלינג האלנד', 'Manchester City', 'מנצ''סטר סיטי', 9.00, null),
    (3, 'Harry Kane', 'הארי קיין', 'Bayern Munich', 'באיירן מינכן', 8.00, null),
    (4, 'Ousmane Dembele', 'אוסמן דמבלה', 'Paris Saint-Germain', 'פריז סן-ז''רמן', 13.00, null),
    (5, 'Jude Bellingham', 'ג''וד בלינגהאם', 'Real Madrid', 'ריאל מדריד', 15.00, null),
    (6, 'Vinicius Jr.', 'ויניסיוס ג''וניור', 'Real Madrid', 'ריאל מדריד', 17.00, null),
    (7, 'Khvicha Kvaratskhelia', 'חוויצ''ה קווארצחליה', 'Paris Saint-Germain', 'פריז סן-ז''רמן', 21.00, null),
    (8, 'Lamine Yamal', 'לאמין ימאל', 'Barcelona', 'ברצלונה', 21.00, null),
    (9, 'Alexander Isak', 'אלכסנדר איסאק', 'Liverpool', 'ליברפול', 21.00, null),
    (10, 'Rapihina', 'ראפיניה', 'Barcelona', 'ברצלונה', 21.00, null),
    (11, 'Lautaro Martinez', 'לאוטרו מרטינס', 'Inter Milan', 'אינטר מילאנו', 21.00, null),
    (12, 'Julian Alvarez', 'חוליאן אלברס', 'Atletico Madrid', 'אתלטיקו מדריד', 26.00, null),
    (13, 'Kai Havertz', 'קאי האברץ', 'Arsenal', 'ארסנל', 26.00, null),
    (14, 'Viktor Gyökeres', 'ויקטור גיוקרס', 'Arsenal', 'ארסנל', 34.00, null),
    (15, 'Ismael Saibari', 'אסמעיל סעיבארי', 'Bayern Munich', 'באיירן מינכן', 34.00, null),
    (16, 'Victor Osimhen', 'ויקטור אוסימן', 'Galatasaray', 'גלאטסראיי', 34.00, null),
    (17, 'Ferran Torres', 'פראן טורס', 'Paris Saint-Germain', 'פריז סן-ז''רמן', 41.00, null),
    (18, 'Michael Olise', 'מייקל אוליסה', 'Bayern Munich', 'באיירן מינכן', 41.00, null),
    (19, 'Yan Diomande', 'יאן דיומנדה', 'Real Madrid', 'ריאל מדריד', 41.00, null),
    (20, 'Marcus Thuram', 'מרקוס תוראם', 'Inter Milan', 'אינטר מילאנו', 41.00, null),
    (21, 'Luis Diaz', 'לואיס דיאס', 'Bayern Munich', 'באיירן מינכן', 41.00, null),
    (22, 'Karim Adeyemi', 'כרים אדיימי', 'Barcelona', 'ברצלונה', 41.00, null),
    (23, 'Marcus Rashford', 'מרקוס רשפורד', 'Manchester United', 'מנצ''סטר יונייטד', 41.00, null),
    (24, 'Desire Doue', 'דזירה דואה', 'Paris Saint-Germain', 'פריז סן-ז''רמן', 51.00, null),
    (25, 'Christos Tzolis', 'כריסטוס צוליס', 'Arsenal', 'ארסנל', 51.00, null),
    (26, 'Endrick', 'אנדריק', 'Real Madrid', 'ריאל מדריד', 51.00, null),
    (27, 'Cody Gakpo', 'קודי חאקפו', 'Liverpool', 'ליברפול', 51.00, null),
    (28, 'Carlos Espí', 'קרלוס אספי', 'Real Madrid', 'ריאל מדריד', 51.00, null),
    (29, 'Bukayo Saka', 'בוקאיו סאקה', 'Arsenal', 'ארסנל', 51.00, null),
    (30, 'Anthony Gordon', 'אנתוני גורדון', 'Barcelona', 'ברצלונה', 51.00, null),
    (31, 'Antoine Semenyo', 'אנטואן סמניו', 'Manchester City', 'מנצ''סטר סיטי', 51.00, null),
    (32, 'Bruno Fernandes', 'ברונו פרננדש', 'Manchester United', 'מנצ''סטר יונייטד', 51.00, null),
    (33, 'Alexander Sorloth', 'אלכסנדר סורלות''', 'Atletico Madrid', 'אתלטיקו מדריד', 51.00, null),
    (34, 'Briana Madjo', 'בריאנה מאדג''ו', 'Aston Villa', 'אסטון וילה', 51.00, null),
    (35, 'Romelu Lukaku', 'רומלו לוקאקו', 'Fenerbahce', 'פנרבחצ''ה', 51.00, null),
    (36, 'Jamaal Musiala', 'ג''מאל מוסיאלה', 'Bayern Munich', 'באיירן מינכן', 51.00, null),
    (37, 'Mika Godts', 'מיקה גודטס', 'Paris Saint-Germain', 'פריז סן-ז''רמן', 67.00, null),
    (38, 'Bradley Barcola', 'בראדלי ברקולה', 'Paris Saint-Germain', 'פריז סן-ז''רמן', 67.00, null),
    (39, 'Benjamin Sesko', 'בנג''מין ששקו', 'Manchester United', 'מנצ''סטר יונייטד', 67.00, null),
    (40, 'Ademola Lookman', 'אדמולה לוקמן', 'Atletico Madrid', 'אתלטיקו מדריד', 67.00, null),
    (41, 'Serhou Guirassy', 'סרהו גיראסי', 'Borussia Dortmund', 'בורוסיה דורטמונד', 67.00, null),
    (42, 'Moreno Gerard', 'מורנו ז''רארד', 'Villarreal', 'ויאריאל', 67.00, null),
    (43, 'Anastasios Douvikas', 'אנסטסיוס דוביקאס', 'Como', 'קומו', 67.00, null),
    (44, 'Fermin Lopez', 'פרמין לופס', 'Barcelona', 'ברצלונה', 81.00, null),
    (45, 'Rodrygo', 'רודריגו', 'Real Madrid', 'ריאל מדריד', 81.00, null),
    (46, 'Phil Foden', 'פיל פודן', 'Manchester City', 'מנצ''סטר סיטי', 81.00, null),
    (47, 'Jeremy Doku', 'ג''רמי דוקו', 'Manchester City', 'מנצ''סטר סיטי', 81.00, null),
    (48, 'Bryan Mbeumo', 'בריאן מביאומו', 'Manchester United', 'מנצ''סטר יונייטד', 81.00, null),
    (49, 'Donyell Malen', 'דונייל מאלן', 'Roma', 'רומא', 81.00, null),
    (50, 'Deniz Undav', 'דניז אונדב', 'Stuttgart', 'שטוטגרט', 81.00, null),
    (51, 'Noni Madueke', 'נוני מדואקה', 'Arsenal', 'ארסנל', 101.00, null),
    (52, 'Dani Olmo', 'דני אולמו', 'Barcelona', 'ברצלונה', 101.00, null),
    (53, 'Arda Guler', 'ארדה גולר', 'Real Madrid', 'ריאל מדריד', 101.00, null),
    (54, 'Rayan Cherki', 'ריאן שרקי', 'Manchester City', 'מנצ''סטר סיטי', 101.00, null),
    (55, 'Florian Wirtz', 'פלוריאן וירץ', 'Liverpool', 'ליברפול', 101.00, null),
    (56, 'Victor Munoz', 'ויקטור מוניוז', 'Liverpool', 'ליברפול', 101.00, null),
    (57, 'Matheus Cunha', 'מתאוס קוניה', 'Manchester United', 'מנצ''סטר יונייטד', 101.00, null),
    (58, 'Johan Manzambi', 'יוהאן מנזאמבי', 'Aston Villa', 'אסטון וילה', 101.00, null),
    (59, 'Rasmus Hojlund', 'רסמוס הוילונד', 'Napoli', 'נאפולי', 101.00, null),
    (60, 'Georges Mikautadze', 'ז''ורז'' מיקאוטאדזה', 'Villarreal', 'ויאריאל', 101.00, null),
    (61, 'Troy Parrott', 'טרוי פארוט', 'Real Betis', 'ריאל בטיס', 101.00, null),
    (62, 'Miguel Andre Silva', 'מיגל אנדרה סילבה', 'Porto', 'פורטו', 101.00, null),
    (63, 'Luis Suarez', 'לואיס סוארס', 'Sporting CP', 'ספורטינג', 101.00, null),
    (64, 'Mason Greenwood', 'מייסון גרינווד', 'Fenerbahce', 'פנרבחצ''ה', 101.00, null),
    (65, 'Baris Yilmaz', 'באריס יילמאז', 'Galatasaray', 'גלאטסראיי', 101.00, null),
    (66, 'Paulo Dybala', 'פאולו דיבאלה', 'Roma', 'רומא', 126.00, null),
    (67, 'Santiago Castro', 'סנטיאגו קסטרו', 'Roma', 'רומא', 126.00, null),
    (68, 'Alvaro Morata', 'אלברו מוראטה', 'Como', 'קומו', 126.00, null),
    (69, 'Ricardo Pepi', 'ריקרדו פפי', 'PSV Eindhoven', 'פ.ס.וו. איינדהובן', 126.00, null),
    (70, 'Nicolas Paz', 'ניקולאס פאס', 'Como', 'קומו', 126.00, null),
    (71, 'Rio Ngumooha', 'ריו נ''גומוהה', 'Liverpool', 'ליברפול', 151.00, null),
    (72, 'Scott McTominay', 'סקוט מקטומיני', 'Napoli', 'נאפולי', 151.00, null),
    (73, 'Maximilian Beier', 'מקסימיליאן בייר', 'Borussia Dortmund', 'בורוסיה דורטמונד', 151.00, null),
    (74, 'Odsonne Edouard', 'אודסון אדואר', 'Lens', 'לאנס', 151.00, null),
    (75, 'Marco Asensio', 'מרקו אסנסיו', 'Fenerbahce', 'פנרבחצ''ה', 151.00, null),
    (76, 'Alejandro Garnacho', 'אלחנדרו גרנאצ''ו', 'Aston Villa', 'אסטון וילה', 151.00, null),
    (77, 'Kevin De Bruyne', 'קווין דה בריינה', 'Napoli', 'נאפולי', 151.00, null),
    (78, 'Cucho Hernandez', 'קוצ''ו הרננדס', 'Real Betis', 'ריאל בטיס', 151.00, null),
    (79, 'Alassane Plea', 'אלאסאן פלאה', 'PSV Eindhoven', 'פ.ס.וו. איינדהובן', 151.00, null),
    (80, 'Leroy Sane', 'לרוי סאנה', 'Galatasaray', 'גלאטסראיי', 151.00, null),
    (81, 'Valentin Castellanos', 'ולנטין קסטז''אנוס', 'West Ham United', 'ווסטהאם', 201.00, null),
    (82, 'Hamza Igamane', 'חמזה איגמאן', 'Lille', 'ליל', 201.00, null),
    (83, 'Ayase Ueda', 'איאסה אואדה', 'Feyenoord', 'פיינורד', 201.00, null),
    (84, 'Antony', 'אנטוני', 'Real Betis', 'ריאל בטיס', 201.00, null),
    (85, 'Olivier Giroud', 'אוליבייה ז''ירו', 'Lille', 'ליל', 201.00, null)
)
insert into public.season_player_candidates (
  season,
  candidate_id,
  name_en,
  name_he,
  photo_url,
  team_name_en,
  team_name_he,
  implied_probability,
  pick_points,
  rank
)
select
  2026,
  rank,
  name_en,
  name_he,
  photo_url,
  team_name_en,
  team_name_he,
  least(1, 1 / odds),
  round(odds)::smallint,
  rank
from player_market;

select setval(
  pg_get_serial_sequence('public.season_player_candidates', 'candidate_id'),
  (select max(candidate_id) from public.season_player_candidates)
);

-- The provider's final result is withheld here until the replay reaches the
-- end of the final. No client policy exists for this table.
create table public.season_outcomes (
  season                  integer       primary key,
  champion_team_id        uuid          not null references public.teams (id),
  top_scorer_football_data_ids integer[] not null
                           check (cardinality(top_scorer_football_data_ids) > 0),
  released_at             timestamptz,
  created_at              timestamptz   not null default now(),
  updated_at              timestamptz   not null default now()
);

create trigger season_outcomes_set_updated_at
  before update on public.season_outcomes
  for each row
  execute function public.set_updated_at();

-- One pair of long-range picks per player and season, editable until the first
-- kickoff. Points are snapshots; clients cannot choose their own odds.
create table public.season_picks (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users (id) on delete cascade,
  season                integer     not null,
  champion_candidate_id integer     not null,
  top_scorer_candidate_id integer   not null,
  champion_pick_points  smallint    not null check (champion_pick_points between 1 and 2000),
  scorer_pick_points    smallint    not null check (scorer_pick_points between 1 and 500),
  champion_awarded_points smallint  not null default 0 check (champion_awarded_points between 0 and 2000),
  scorer_awarded_points   smallint  not null default 0 check (scorer_awarded_points between 0 and 500),
  settled_at             timestamptz,
  created_at            timestamptz not null default now(),

  unique (user_id, season),
  foreign key (season, champion_candidate_id)
    references public.season_team_candidates (season, candidate_id),
  foreign key (season, top_scorer_candidate_id)
    references public.season_player_candidates (season, candidate_id)
);

create or replace function public.set_season_pick_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select c.pick_points into new.champion_pick_points
  from public.season_team_candidates c
  where c.season = new.season and c.candidate_id = new.champion_candidate_id;

  select c.pick_points into new.scorer_pick_points
  from public.season_player_candidates c
  where c.season = new.season and c.candidate_id = new.top_scorer_candidate_id;

  if new.champion_pick_points is null or new.scorer_pick_points is null then
    raise exception 'season-pick candidate does not exist';
  end if;

  return new;
end;
$$;

create trigger season_picks_snapshot_points
  before insert or update of champion_candidate_id, top_scorer_candidate_id
  on public.season_picks
  for each row
  execute function public.set_season_pick_points();

create or replace function public.season_picks_are_open(target_season integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.fixtures f
    where f.season = target_season
      and f.kickoff_at <= now()
  );
$$;

revoke all on function public.season_picks_are_open(integer) from public;
grant execute on function public.season_picks_are_open(integer) to authenticated;

-- Atomically saves the caller's season picks. The caller identity is always
-- taken from the verified JWT, the lock is checked in the same transaction,
-- and the table trigger snapshots candidate points from trusted rows.
create or replace function public.save_my_season_pick(
  target_season integer,
  target_champion_candidate_id integer,
  target_top_scorer_candidate_id integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.season_picks_are_open(target_season) then
    raise exception 'season picks are locked' using errcode = 'P0001';
  end if;

  insert into public.season_picks (
    user_id,
    season,
    champion_candidate_id,
    top_scorer_candidate_id,
    champion_pick_points,
    scorer_pick_points
  )
  values (
    auth.uid(),
    target_season,
    target_champion_candidate_id,
    target_top_scorer_candidate_id,
    0,
    0
  )
  on conflict (user_id, season) do update
  set
    champion_candidate_id = excluded.champion_candidate_id,
    top_scorer_candidate_id = excluded.top_scorer_candidate_id;
end;
$$;

revoke all on function public.save_my_season_pick(integer, integer, integer)
  from public;
grant execute on function public.save_my_season_pick(integer, integer, integer)
  to authenticated;

-- Returns the current season and whether its long-range picks may be shown.
-- Keeping this decision in SQL means the leaderboard and season-pick form use
-- the same first-kickoff boundary.
create or replace function public.current_season_pick_state()
returns table (
  season integer,
  revealed boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select latest.season, not public.season_picks_are_open(latest.season)
  from (
    select max(candidate.season) as season
    from public.season_team_candidates candidate
  ) latest
  where latest.season is not null;
$$;

-- RLS on season_picks still applies because this function is SECURITY INVOKER.
-- Before kickoff it returns only the caller's row; afterwards it returns every
-- row permitted by the first-kickoff policy, already joined to candidate media.
create or replace function public.get_visible_leaderboard_season_picks()
returns table (
  user_id uuid,
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
security invoker
set search_path = public
as $$
  select
    picks.user_id,
    picks.season,
    picks.champion_awarded_points,
    picks.scorer_awarded_points,
    picks.settled_at,
    champion.name_en,
    champion.name_he,
    champion.logo_url,
    scorer.name_en,
    scorer.name_he,
    scorer.photo_url
  from public.season_picks picks
  join public.season_team_candidates champion
    on champion.season = picks.season
   and champion.candidate_id = picks.champion_candidate_id
  join public.season_player_candidates scorer
    on scorer.season = picks.season
   and scorer.candidate_id = picks.top_scorer_candidate_id
  order by picks.season desc, picks.user_id;
$$;

revoke all on function public.current_season_pick_state() from public;
grant execute on function public.current_season_pick_state() to authenticated;

revoke all on function public.get_visible_leaderboard_season_picks() from public;
grant execute on function public.get_visible_leaderboard_season_picks()
  to authenticated;

create index season_picks_user_idx on public.season_picks (user_id);
create index season_picks_unsettled_idx
  on public.season_picks (season)
  where settled_at is null;

-- Admin-only scoring overrides. Each candidate price and every unsettled pick
-- that references it change in one transaction, so the visible price and the
-- eventual award cannot drift apart. Execute is revoked from client roles.
create or replace function public.admin_set_team_candidate_points(
  target_season integer,
  target_candidate_id integer,
  new_points smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.season_team_candidates
  set pick_points = new_points
  where season = target_season and candidate_id = target_candidate_id;

  if not found then
    raise exception 'team candidate does not exist';
  end if;

  update public.season_picks
  set champion_pick_points = new_points
  where season = target_season
    and champion_candidate_id = target_candidate_id
    and settled_at is null;
end;
$$;

create or replace function public.admin_set_player_candidate_points(
  target_season integer,
  target_candidate_id integer,
  new_points smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.season_player_candidates
  set pick_points = new_points
  where season = target_season and candidate_id = target_candidate_id;

  if not found then
    raise exception 'player candidate does not exist';
  end if;

  update public.season_picks
  set scorer_pick_points = new_points
  where season = target_season
    and top_scorer_candidate_id = target_candidate_id
    and settled_at is null;
end;
$$;

revoke all on function public.admin_set_team_candidate_points(integer, integer, smallint)
  from public, anon, authenticated;
revoke all on function public.admin_set_player_candidate_points(integer, integer, smallint)
  from public, anon, authenticated;

-- ============================================================ predictions ==

-- User predictions, and the two rules that must hold even if the application
-- layer is bypassed entirely:
--
--   1. THE LOCK (§6). A prediction may be written only while its fixture is
--      still in the future. Enforced against fixtures.kickoff_at, which is the
--      rebased kickoff when a season is being replayed.
--
--   2. BLIND PLAY (§11). Nobody may read anyone else's prediction until that
--      fixture has kicked off.
create table public.predictions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  fixture_id    uuid        not null references public.fixtures (id) on delete cascade,

  -- Regulation-time scoreline the user is calling (§6.3). Capped rather than
  -- merely non-negative: a 32767-goal prediction is a bug or an attack, not a
  -- forecast.
  home_goals    smallint    not null check (home_goals between 0 and 20),
  away_goals    smallint    not null check (away_goals between 0 and 20),

  is_joker      boolean     not null default false,

  -- Denormalised from public.fixtures by the trigger below. Exists only so the
  -- one-joker-per-round rule can be a unique index: an index cannot reach into
  -- another table, and this rule is too important to leave to application code.
  fixture_round text        not null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One prediction per user per fixture. Changing a call is an UPDATE.
  constraint predictions_one_per_fixture unique (user_id, fixture_id)
);

comment on table public.predictions is
  'One prediction per user per fixture. Locked at kickoff by RLS, not by the UI.';
comment on column public.predictions.fixture_round is
  'Copied from fixtures.round by a trigger; backs the one-joker-per-round index.';

-- §6.4: one joker per matchday. Keyed on the round label rather than the
-- matchday number because knockout fixtures have no matchday, and a user should
-- get one joker in the quarter-finals just as in League Stage 3.
create unique index predictions_one_joker_per_round
  on public.predictions (user_id, fixture_round)
  where is_joker;

create index predictions_fixture_idx on public.predictions (fixture_id);
create index predictions_user_idx on public.predictions (user_id);

create trigger predictions_set_updated_at
  before update on public.predictions
  for each row
  execute function public.set_updated_at();

-- SECURITY DEFINER so the copy succeeds regardless of the caller's read access
-- to public.fixtures, and so the client can never spoof fixture_round to dodge
-- the joker index by claiming a round its fixture does not belong to.
create or replace function public.set_prediction_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select f.round into new.fixture_round
  from public.fixtures f
  where f.id = new.fixture_id;

  if new.fixture_round is null then
    raise exception 'fixture % does not exist', new.fixture_id;
  end if;

  return new;
end;
$$;

create trigger predictions_set_round
  before insert or update of fixture_id on public.predictions
  for each row
  execute function public.set_prediction_round();

-- ====================================================== prediction scores ==

-- Settled points, one row per scored prediction.
--
-- Kept in its own table rather than as columns on public.predictions because
-- users hold an UPDATE policy on their predictions (to amend a call before
-- kickoff), and RLS is row-level, not column-level. Points living on that same
-- row would be writable by the person being scored. Here there is no write
-- policy at all, so only the settlement job can award anything.
--
-- Every number is produced by scorePrediction() in lib/scoring/engine.ts. The
-- multipliers are stored alongside the total, not just the total, so that the
-- breakdown a user is shown is the arithmetic that actually ran rather than a
-- re-derivation that could drift from it.
create table public.prediction_scores (
  prediction_id           uuid primary key
                            references public.predictions (id) on delete cascade,

  -- Denormalised so the score history and, later, group leaderboards can
  -- aggregate without joining back through predictions.
  user_id                 uuid        not null references auth.users (id) on delete cascade,
  fixture_id              uuid        not null references public.fixtures (id) on delete cascade,

  -- §6.1
  base_points             smallint    not null check (base_points >= 0),
  correct_outcome         boolean     not null,
  correct_goal_difference boolean     not null,
  exact_score             boolean     not null,

  -- §6.2 / §6.3 / §6.4
  difficulty_multiplier   numeric(4, 2) not null check (difficulty_multiplier > 0),
  stage_multiplier        numeric(4, 2) not null check (stage_multiplier > 0),
  joker_multiplier        numeric(4, 2) not null check (joker_multiplier > 0),

  -- §6.6: rounded once, at the end, so the multipliers do not compound
  -- rounding. This is the authoritative figure.
  total_points            smallint    not null check (total_points >= 0),

  -- The BreakdownLine[] the engine emitted: translation keys and values, never
  -- user-facing sentences (§9).
  breakdown               jsonb       not null,

  settled_at              timestamptz not null default now(),

  constraint prediction_scores_one_per_user_fixture unique (user_id, fixture_id)
);

comment on table public.prediction_scores is
  'Settled points. Written only by the settlement job; no client write policy exists.';
comment on column public.prediction_scores.total_points is
  'Authoritative award. Anything shown before settlement is a projection, not this.';

create index prediction_scores_user_idx on public.prediction_scores (user_id);
create index prediction_scores_fixture_idx on public.prediction_scores (fixture_id);
-- Supports leaderboard aggregation without scanning every settled score.
create index prediction_scores_user_points_idx
  on public.prediction_scores (user_id, total_points);

-- ========================================================== game settings ==

-- Singleton runtime rules shared by scoring, settlement, and the rules page.
create table public.game_settings (
  id               smallint primary key default 1 check (id = 1),
  exact_points     smallint    not null default 3 check (exact_points between 1 and 100),
  outcome_points   smallint    not null default 1 check (outcome_points between 1 and 100),
  rules_note_en    text        not null default '' check (char_length(rules_note_en) <= 2000),
  rules_note_he    text        not null default '' check (char_length(rules_note_he) <= 2000),
  updated_by       uuid        references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),

  constraint game_settings_exact_exceeds_outcome
    check (exact_points > outcome_points)
);

insert into public.game_settings (id) values (1);

create trigger game_settings_set_updated_at
  before update on public.game_settings
  for each row
  execute function public.set_updated_at();

-- Updates public rules and recalculates already-settled predictions in one
-- transaction so the rules page and leaderboard cannot disagree.
create or replace function public.admin_set_game_settings(
  new_exact_points smallint,
  new_outcome_points smallint,
  new_rules_note_en text,
  new_rules_note_he text,
  admin_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_exact_points <= new_outcome_points
    or new_exact_points < 1
    or new_exact_points > 100
    or new_outcome_points < 1
    or new_outcome_points > 100 then
    raise exception 'invalid scoring rules';
  end if;

  update public.game_settings
  set exact_points = new_exact_points,
      outcome_points = new_outcome_points,
      rules_note_en = left(coalesce(new_rules_note_en, ''), 2000),
      rules_note_he = left(coalesce(new_rules_note_he, ''), 2000),
      updated_by = admin_user_id
  where id = 1;

  update public.prediction_scores ps
  set base_points = scored.points,
      correct_outcome = scored.correct_outcome,
      correct_goal_difference = scored.correct_goal_difference,
      exact_score = scored.exact_score,
      difficulty_multiplier = 1,
      stage_multiplier = 1,
      joker_multiplier = 1,
      total_points = scored.points,
      breakdown = jsonb_build_array(
        jsonb_build_object(
          'key', case
            when scored.exact_score then 'exactScore'
            when scored.correct_outcome then 'correctOutcome'
            else 'wrongOutcome'
          end,
          'value', scored.points
        )
      ),
      settled_at = now()
  from public.predictions p
  join public.fixtures f on f.id = p.fixture_id
  cross join lateral (
    select
      p.home_goals = f.home_goals and p.away_goals = f.away_goals as exact_score,
      sign(p.home_goals - p.away_goals) = sign(f.home_goals - f.away_goals)
        as correct_outcome,
      p.home_goals - p.away_goals = f.home_goals - f.away_goals
        as correct_goal_difference,
      case
        when p.home_goals = f.home_goals and p.away_goals = f.away_goals
          then new_exact_points
        when sign(p.home_goals - p.away_goals) = sign(f.home_goals - f.away_goals)
          then new_outcome_points
        else 0
      end::smallint as points
  ) scored
  where ps.prediction_id = p.id
    and f.home_goals is not null
    and f.away_goals is not null;
end;
$$;

-- ======================================================= team squads ===

-- Seasonal team rosters imported from the licensed football data provider.
-- Match lineups remain in fixture_details because they describe one match;
-- these rows describe every registered player available for the whole season.
create table public.team_squad_players (
  season            integer     not null,
  team_id           uuid        not null
                                references public.teams (id) on delete cascade,
  football_data_id  integer,
  name              text        not null check (char_length(trim(name)) between 1 and 100),
  position          text,
  shirt_number      smallint    check (shirt_number between 0 and 99),
  nationality       text,
  date_of_birth     date,
  photo_url         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  source            text        not null default 'football-data'
                                check (char_length(trim(source)) > 0),
  source_player_id  text        not null
                                check (char_length(trim(source_player_id)) > 0),

  primary key (season, team_id, source, source_player_id)
);

comment on table public.team_squad_players is
  'Seasonal club squads imported from a named provider or a user-supplied data file.';
comment on column public.team_squad_players.photo_url is
  'Optional licensed player image copied into the project-owned player-images bucket.';
comment on column public.team_squad_players.source is
  'Stable source key, for example football-data or supplied-csv.';
comment on column public.team_squad_players.source_player_id is
  'Identifier within source; supplied files use a deterministic player key.';

create index team_squad_players_team_season_idx
  on public.team_squad_players (team_id, season);

create trigger team_squad_players_set_updated_at
  before update on public.team_squad_players
  for each row
  execute function public.set_updated_at();

alter table public.team_squad_players enable row level security;

create policy "team squad players: readable by everyone"
  on public.team_squad_players
  for select
  to anon, authenticated
  using (true);

grant select on public.team_squad_players to anon, authenticated;
grant all on public.team_squad_players to service_role;

-- ==================================================== provider poll state ==

-- Coordinates overlapping cron invocations across application instances.
create table public.provider_poll_state (
  job                text primary key,
  last_requested_at  timestamptz not null
);

create or replace function public.claim_football_data_live_poll()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  insert into public.provider_poll_state (job, last_requested_at)
  values ('football_data_live', now())
  on conflict (job) do update
    set last_requested_at = excluded.last_requested_at
    where provider_poll_state.last_requested_at <= now() - interval '55 seconds'
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

-- ==================================================== row level security ===

alter table public.teams             enable row level security;
alter table public.profiles          enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.fixtures          enable row level security;
alter table public.ai_match_predictions enable row level security;
alter table public.fixture_recent_form enable row level security;
alter table public.fixture_results   enable row level security;
alter table public.fixture_details   enable row level security;
alter table public.season_team_candidates   enable row level security;
alter table public.season_player_candidates enable row level security;
alter table public.season_outcomes          enable row level security;
alter table public.season_picks             enable row level security;
alter table public.predictions       enable row level security;
alter table public.prediction_scores enable row level security;
alter table public.game_settings     enable row level security;
alter table public.provider_poll_state enable row level security;

-- ---------------------------------------------------------------- teams ---
-- Reference data is public: the fixture list is the landing page, and it must
-- render for a visitor who has not signed in.

create policy "teams: readable by everyone"
  on public.teams
  for select
  to anon, authenticated
  using (true);

-- ------------------------------------------------------------- fixtures ---

create policy "fixtures: readable by everyone"
  on public.fixtures
  for select
  to anon, authenticated
  using (true);

create policy "AI match predictions: readable by everyone"
  on public.ai_match_predictions
  for select
  to anon, authenticated
  using (true);

-- -------------------------------------------------------- game settings ---

create policy "game settings: public read"
  on public.game_settings
  for select
  to public
  using (true);

-- ------------------------------------------------------------- profiles ---

-- RLS is row-level, so authenticated users can read the complete public profile
-- row: display name, avatar, favourite team, locale, and timestamps. Sensitive
-- identity data such as email remains isolated in auth.users.
create policy "profiles: readable by any signed-in player"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "profiles: update own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Insert is handled by the signup trigger. A policy is still required so that
-- a client-side upsert during onboarding succeeds for the user's own row.
create policy "profiles: insert own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Deliberately no DELETE policy: profiles are removed by the cascade from
-- auth.users, not by the client.

-- --------------------------------------------------------------- groups ---

create policy "groups: members can read"
  on public.groups
  for select
  to authenticated
  using (public.is_group_member(id));

create policy "groups: authenticated can create"
  on public.groups
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "groups: managers can update"
  on public.groups
  for update
  to authenticated
  using (public.can_manage_group(id))
  with check (public.can_manage_group(id));

create policy "groups: managers can delete"
  on public.groups
  for delete
  to authenticated
  using (public.can_manage_group(id));

create policy "group members: members can read roster"
  on public.group_members
  for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "group members: managers can add"
  on public.group_members
  for insert
  to authenticated
  with check (public.can_manage_group(group_id));

create policy "group members: managers can update roles"
  on public.group_members
  for update
  to authenticated
  using (public.can_manage_group(group_id))
  with check (public.can_manage_group(group_id));

create policy "group members: managers or self can remove"
  on public.group_members
  for delete
  to authenticated
  using (public.can_manage_group(group_id) or user_id = auth.uid());

-- ------------------------------------------------------ fixture_results ---
-- Intentionally NO policies. Service-role only; see the SECURITY note above.

-- --------------------------------------------------------- season picks ---

-- season_outcomes intentionally has NO policies. The ingest and settlement
-- service roles are the only actors allowed to see the hidden winners.

create policy "season team candidates: readable when signed in"
  on public.season_team_candidates
  for select
  to authenticated
  using (true);

create policy "season player candidates: readable when signed in"
  on public.season_player_candidates
  for select
  to authenticated
  using (true);

create policy "season picks: read own"
  on public.season_picks
  for select
  to authenticated
  using (user_id = auth.uid());

-- Picks stay private until the first fixture kicks off. After that the
-- leaderboard can reveal every submitted choice, whether settled or not.
create policy "season picks: read others after first kickoff"
  on public.season_picks
  for select
  to authenticated
  using (not public.season_picks_are_open(season));

create policy "season picks: insert own"
  on public.season_picks
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.season_picks_are_open(season)
  );

create policy "season picks: update own before first kickoff"
  on public.season_picks
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.season_picks_are_open(season)
  )
  with check (
    user_id = auth.uid()
    and public.season_picks_are_open(season)
  );

-- No DELETE policy: a submitted pair remains present for scoring.

-- ---------------------------------------------------------- predictions ---

-- A user always sees their own call, before or after kickoff.
create policy "predictions: read own"
  on public.predictions
  for select
  to authenticated
  using (user_id = auth.uid());

-- Everyone else's becomes visible only once the fixture has started. Multiple
-- permissive SELECT policies are OR'd, so this widens the policy above rather
-- than fighting it.
create policy "predictions: read others once the fixture has started"
  on public.predictions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fixtures f
      where f.id = predictions.fixture_id
        and f.kickoff_at <= now()
    )
  );

-- The lock, on the way in.
create policy "predictions: insert own before kickoff"
  on public.predictions
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fixtures f
      where f.id = fixture_id
        and f.kickoff_at > now()
        and f.status = 'scheduled'
    )
  );

-- ...and on the way through. USING gates which rows may be updated; WITH CHECK
-- gates the result, so neither the old nor the new state may straddle kickoff.
create policy "predictions: update own before kickoff"
  on public.predictions
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fixtures f
      where f.id = predictions.fixture_id
        and f.kickoff_at > now()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fixtures f
      where f.id = fixture_id
        and f.kickoff_at > now()
    )
  );

-- No DELETE policy: a prediction is amended, never withdrawn. Removing one
-- after seeing the team news would be a way to dodge a bad call.

-- ---------------------------------------------------- prediction_scores ---

create policy "prediction scores: read own"
  on public.prediction_scores
  for select
  to authenticated
  using (user_id = auth.uid());

-- Mirrors the blind rule on predictions: another player's score is only
-- meaningful once their prediction is visible, which is at kickoff.
create policy "prediction scores: read others once the fixture has started"
  on public.prediction_scores
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fixtures f
      where f.id = prediction_scores.fixture_id
        and f.kickoff_at <= now()
    )
  );

-- No policies exist for fixture_results, fixture_details, season_outcomes, or
-- provider_poll_state. Only the service role can access those tables.
-- No write policies exist on teams, fixtures, or prediction_scores.
-- Ingestion and settlement run as the service role, which bypasses RLS.

-- ========================================================== privileges ===

-- Dropping public also drops its grants. Restore only the privileges each
-- client role needs; RLS then decides which rows an authenticated user sees.
revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.teams,
  public.fixtures,
  public.ai_match_predictions,
  public.game_settings,
  public.team_squad_players
  to anon, authenticated;

grant select, insert, update on public.profiles
  to authenticated;

grant select, insert, update, delete on
  public.groups,
  public.group_members
  to authenticated;

grant select on
  public.season_team_candidates,
  public.season_player_candidates,
  public.prediction_scores
  to authenticated;

-- ON CONFLICT DO UPDATE requires UPDATE privilege even on the first insert.
-- RLS still limits changes to the owner and closes them at first kickoff.
grant select, insert, update on public.season_picks
  to authenticated;

grant select, insert, update on public.predictions
  to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

revoke all on function public.admin_set_game_settings(
  smallint,
  smallint,
  text,
  text,
  uuid
) from public, anon, authenticated;
grant execute on function public.admin_set_game_settings(
  smallint,
  smallint,
  text,
  text,
  uuid
) to service_role;

revoke all on function public.claim_football_data_live_poll()
  from public, anon, authenticated;
grant execute on function public.claim_football_data_live_poll()
  to service_role;

-- ======================================================= avatar storage ===

-- Storage lives outside the rebuilt public schema. Upsert the bucket and
-- recreate its policies so this script remains safe to run repeatedly.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: public read" on storage.objects;
drop policy if exists "avatars: upload own" on storage.objects;
drop policy if exists "avatars: update own" on storage.objects;
drop policy if exists "avatars: delete own" on storage.objects;

create policy "avatars: public read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

create policy "avatars: upload own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.filename(name) = 'avatar'
  );

create policy "avatars: update own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.filename(name) = 'avatar'
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.filename(name) = 'avatar'
  );

create policy "avatars: delete own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.filename(name) = 'avatar'
  );

-- Make the new relations visible to PostgREST immediately after COMMIT.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- GROUP PROFILES AND INVITES
-- ============================================================================
-- Group identity, shareable invitations and manager-confirmed entry fees.

alter table public.groups
  add column image_url text,
  add column entry_fee_agorot integer not null default 0
    check (entry_fee_agorot between 0 and 100000000),
  add column invite_code uuid not null default gen_random_uuid() unique;

create type public.group_join_request_status as enum (
  'pending_payment',
  'approved',
  'declined'
);

create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.group_join_request_status not null default 'pending_payment',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  unique (group_id, user_id)
);

create index group_join_requests_group_status_idx
  on public.group_join_requests (group_id, status);

alter table public.group_join_requests enable row level security;

-- Join requests expose payment status and are therefore handled exclusively
-- by authenticated server actions after explicit membership checks.
revoke all on public.group_join_requests from anon, authenticated;
grant select, insert, update, delete on public.group_join_requests to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'group-images',
  'group-images',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "group images: public read" on storage.objects;

create policy "group images: public read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'group-images');

comment on column public.groups.entry_fee_agorot is
  'Entry fee in Israeli agorot. Payment is confirmed manually by a group manager.';
comment on column public.groups.invite_code is
  'Stable unguessable token used by the WhatsApp invitation URL.';

-- ============================================================================
-- AEK TRANSLATION LINK
-- ============================================================================
-- Football-Data names AEK Athens "PAE AEK". Link that provider team to the
-- curated entry so fixtures use the Hebrew display name and future ingests
-- keep the association.
update public.season_team_candidates as candidate
set
  football_data_id = provider_team.football_data_id,
  team_id = provider_team.id,
  logo_url = coalesce(candidate.logo_url, provider_team.logo_url)
from public.teams as provider_team
where candidate.season = 2026
  and candidate.name_en = 'AEK Athens'
  and provider_team.football_data_id = 1899;

-- ============================================================================
-- GROUP PAYMENTS
-- ============================================================================
-- Optional, manager-configured external payment links for each friends group.
-- The amount is the group's entry_fee_agorot from migration 0002. The app
-- never receives financial credentials and never marks an external transfer paid.
alter table public.groups
  add column bit_payment_url text,
  add column paybox_payment_url text,
  add column payment_note text,
  add constraint groups_bit_payment_url_length check (
    bit_payment_url is null
    or (
      char_length(bit_payment_url) between 1 and 2048
      and bit_payment_url ~* '^https://'
      and bit_payment_url ~* '^https://(www\.)?bitpay\.co\.il(/|$)'
    )
  ),
  add constraint groups_paybox_payment_url_length check (
    paybox_payment_url is null
    or (
      char_length(paybox_payment_url) between 1 and 2048
      and paybox_payment_url ~* '^https://'
      and paybox_payment_url ~* '^https://(link|links)\.payboxapp\.com(/|$)|^https://payboxapp\.page\.link(/|$)'
    )
  ),
  add constraint groups_payment_note_length check (
    payment_note is null
    or char_length(trim(payment_note)) between 1 and 160
  ),
  add constraint groups_payment_configuration_complete check (
    payment_note is null
    or bit_payment_url is not null
    or paybox_payment_url is not null
  ),
  add constraint groups_payment_requires_entry_fee check (
    (bit_payment_url is null and paybox_payment_url is null)
    or entry_fee_agorot > 0
  );

comment on column public.groups.bit_payment_url is
  'Manager-provided HTTPS share link opened externally; the app does not process the payment.';
comment on column public.groups.paybox_payment_url is
  'Manager-provided HTTPS group/share link opened externally; the app does not process the payment.';
comment on column public.groups.payment_note is
  'Optional manager-provided note shown beside the external payment links.';

-- ============================================================================
-- FIXTURE METADATA AND PREDICTION POINTS
-- ============================================================================
-- The provider identifies Como as "Como 1907", while the curated market uses
-- "Como". Link the provider team so fixtures consistently use the Hebrew name.
update public.season_team_candidates as candidate
set
  football_data_id = provider_team.football_data_id,
  team_id = provider_team.id,
  logo_url = coalesce(candidate.logo_url, provider_team.logo_url)
from public.teams as provider_team
where candidate.season = 2026
  and candidate.name_en = 'Como'
  and provider_team.football_data_id = 7397;

-- Per-fixture prediction awards for the 2026/27 Champions League.
--
-- A correct outcome receives the matching home/draw/away value. An exact
-- score receives twice that value. The default keeps future provider-created
-- fixtures valid until their own market values are loaded.
alter table public.fixtures
  add column home_win_points smallint not null default 1
    check (home_win_points between 1 and 100),
  add column draw_points smallint not null default 1
    check (draw_points between 1 and 100),
  add column away_win_points smallint not null default 1
    check (away_win_points between 1 and 100);

comment on column public.fixtures.home_win_points is
  'Prediction-game points for correctly calling a home win.';
comment on column public.fixtures.draw_points is
  'Prediction-game points for correctly calling a draw.';
comment on column public.fixtures.away_win_points is
  'Prediction-game points for correctly calling an away win.';

with supplied(matchday, home_name, away_name, home_points, draw_points, away_points) as (
  values
    (1, 'PAE AEK', 'LASK Linz', 4, 8, 8),
    (1, 'Club Brugge KV', 'Aston Villa FC', 7, 8, 5),
    (1, 'Borussia Dortmund', 'Villarreal CF', 4, 8, 9),
    (1, 'FC Porto', 'Manchester City FC', 8, 8, 4),
    (1, 'Lille OSC', 'Real Betis Balompié', 5, 8, 7),
    (1, 'Real Madrid CF', 'FC Internazionale Milano', 4, 8, 9),
    (1, 'FC Barcelona', 'Feyenoord Rotterdam', 2, 9, 12),
    (1, 'VfB Stuttgart', 'Viking FK', 3, 9, 11),
    (1, 'Liverpool FC', 'Club Atlético de Madrid', 4, 8, 8),
    (1, 'Paris Saint-Germain FC', 'ŠK Slovan Bratislava', 2, 10, 12),
    (1, 'Sporting Clube de Portugal', 'Galatasaray SK', 4, 8, 9),
    (1, 'SSC Napoli', 'Arsenal FC', 7, 8, 5),
    (1, 'Fenerbahçe SK', 'AS Roma', 6, 7, 6),
    (1, 'PSV', 'FK Shakhtar Donetsk', 3, 8, 9),
    (1, 'Como 1907', 'RB Leipzig', 7, 8, 5),
    (1, 'FC Bayern München', 'FK Bodø/Glimt', 2, 9, 12),
    (1, 'Manchester United FC', 'Sabah FK', 2, 10, 12),
    (1, 'SK Slavia Praha', 'Racing Club de Lens', 6, 7, 6),
    (2, 'Racing Club de Lens', 'Sporting Clube de Portugal', 7, 8, 5),
    (2, 'Sabah FK', 'SK Slavia Praha', 9, 8, 4),
    (2, 'Arsenal FC', 'Lille OSC', 2, 9, 11),
    (2, 'Club Atlético de Madrid', 'Manchester United FC', 4, 8, 8),
    (2, 'FC Internazionale Milano', 'Club Brugge KV', 2, 9, 12),
    (2, 'Galatasaray SK', 'FC Barcelona', 10, 8, 3),
    (2, 'RB Leipzig', 'PSV', 5, 8, 7),
    (2, 'Viking FK', 'FC Bayern München', 12, 9, 2),
    (2, 'Villarreal CF', 'SSC Napoli', 6, 7, 6),
    (2, 'Feyenoord Rotterdam', 'Como 1907', 4, 8, 9),
    (2, 'LASK Linz', 'Liverpool FC', 12, 9, 2),
    (2, 'AS Roma', 'Real Madrid CF', 8, 8, 4),
    (2, 'Aston Villa FC', 'Fenerbahçe SK', 3, 8, 9),
    (2, 'FK Shakhtar Donetsk', 'PAE AEK', 3, 8, 9),
    (2, 'FK Bodø/Glimt', 'Borussia Dortmund', 9, 8, 4),
    (2, 'Manchester City FC', 'Paris Saint-Germain FC', 5, 8, 8),
    (2, 'Real Betis Balompié', 'FC Porto', 6, 7, 6),
    (2, 'ŠK Slovan Bratislava', 'VfB Stuttgart', 9, 8, 4),
    (3, 'Fenerbahçe SK', 'SK Slavia Praha', 3, 8, 10),
    (3, 'Sabah FK', 'Borussia Dortmund', 12, 9, 2),
    (3, 'AS Roma', 'ŠK Slovan Bratislava', 2, 9, 12),
    (3, 'FC Porto', 'PSV', 5, 8, 8),
    (3, 'Liverpool FC', 'Villarreal CF', 2, 9, 11),
    (3, 'Manchester City FC', 'PAE AEK', 2, 10, 12),
    (3, 'Paris Saint-Germain FC', 'FC Barcelona', 5, 8, 7),
    (3, 'SSC Napoli', 'FK Bodø/Glimt', 2, 9, 11),
    (3, 'VfB Stuttgart', 'Club Atlético de Madrid', 9, 8, 4),
    (3, 'Como 1907', 'Manchester United FC', 9, 8, 4),
    (3, 'Lille OSC', 'Galatasaray SK', 5, 8, 8),
    (3, 'Aston Villa FC', 'Viking FK', 2, 9, 12),
    (3, 'Club Brugge KV', 'Racing Club de Lens', 4, 8, 8),
    (3, 'FC Bayern München', 'Arsenal FC', 5, 8, 8),
    (3, 'FC Internazionale Milano', 'FK Shakhtar Donetsk', 2, 9, 12),
    (3, 'Real Madrid CF', 'RB Leipzig', 2, 9, 12),
    (3, 'Real Betis Balompié', 'Feyenoord Rotterdam', 5, 8, 8),
    (3, 'Sporting Clube de Portugal', 'LASK Linz', 2, 9, 12),
    (4, 'FK Shakhtar Donetsk', 'Sporting Clube de Portugal', 7, 8, 5),
    (4, 'Galatasaray SK', 'VfB Stuttgart', 4, 8, 8),
    (4, 'Club Atlético de Madrid', 'FC Bayern München', 6, 7, 6),
    (4, 'FC Barcelona', 'Aston Villa FC', 3, 8, 10),
    (4, 'Feyenoord Rotterdam', 'FC Internazionale Milano', 8, 8, 4),
    (4, 'FK Bodø/Glimt', 'Lille OSC', 7, 8, 5),
    (4, 'LASK Linz', 'ŠK Slovan Bratislava', 4, 8, 8),
    (4, 'Manchester United FC', 'AS Roma', 4, 8, 8),
    (4, 'Villarreal CF', 'Paris Saint-Germain FC', 9, 8, 4),
    (4, 'PAE AEK', 'Real Madrid CF', 12, 9, 2),
    (4, 'Fenerbahçe SK', 'Liverpool FC', 9, 8, 4),
    (4, 'Borussia Dortmund', 'Real Betis Balompié', 3, 8, 9),
    (4, 'FC Porto', 'SSC Napoli', 5, 8, 7),
    (4, 'PSV', 'Club Brugge KV', 4, 8, 9),
    (4, 'RB Leipzig', 'Manchester City FC', 9, 8, 4),
    (4, 'Racing Club de Lens', 'Como 1907', 5, 8, 8),
    (4, 'SK Slavia Praha', 'Arsenal FC', 11, 9, 2),
    (4, 'Viking FK', 'Sabah FK', 3, 8, 10),
    (5, 'FK Bodø/Glimt', 'LASK Linz', 4, 8, 9),
    (5, 'Galatasaray SK', 'Aston Villa FC', 7, 8, 5),
    (5, 'Arsenal FC', 'Borussia Dortmund', 4, 8, 9),
    (5, 'Como 1907', 'PAE AEK', 4, 8, 9),
    (5, 'Feyenoord Rotterdam', 'FC Porto', 6, 7, 6),
    (5, 'Manchester City FC', 'SSC Napoli', 3, 9, 10),
    (5, 'RB Leipzig', 'Racing Club de Lens', 3, 8, 9),
    (5, 'Real Madrid CF', 'PSV', 2, 9, 11),
    (5, 'ŠK Slovan Bratislava', 'Real Betis Balompié', 10, 8, 3),
    (5, 'Sabah FK', 'FC Barcelona', 12, 10, 2),
    (5, 'SK Slavia Praha', 'Villarreal CF', 8, 8, 5),
    (5, 'Club Atlético de Madrid', 'Viking FK', 2, 10, 12),
    (5, 'Club Brugge KV', 'Liverpool FC', 10, 8, 3),
    (5, 'FC Internazionale Milano', 'VfB Stuttgart', 2, 9, 12),
    (5, 'FK Shakhtar Donetsk', 'Fenerbahçe SK', 6, 7, 6),
    (5, 'Lille OSC', 'FC Bayern München', 9, 8, 4),
    (5, 'Paris Saint-Germain FC', 'AS Roma', 3, 9, 10),
    (5, 'Sporting Clube de Portugal', 'Manchester United FC', 6, 7, 6),
    (6, 'Viking FK', 'Feyenoord Rotterdam', 9, 8, 4),
    (6, 'Villarreal CF', 'Sabah FK', 2, 10, 12),
    (6, 'PAE AEK', 'Galatasaray SK', 8, 8, 5),
    (6, 'AS Roma', 'Sporting Clube de Portugal', 5, 8, 8),
    (6, 'Aston Villa FC', 'Paris Saint-Germain FC', 7, 8, 5),
    (6, 'FC Barcelona', 'Manchester City FC', 5, 8, 7),
    (6, 'FC Bayern München', 'SK Slavia Praha', 2, 10, 12),
    (6, 'Manchester United FC', 'RB Leipzig', 4, 8, 9),
    (6, 'SSC Napoli', 'Club Brugge KV', 3, 8, 10),
    (6, 'Real Betis Balompié', 'Como 1907', 3, 8, 9),
    (6, 'ŠK Slovan Bratislava', 'FK Shakhtar Donetsk', 8, 8, 4),
    (6, 'Arsenal FC', 'Real Madrid CF', 6, 7, 6),
    (6, 'Borussia Dortmund', 'FC Internazionale Milano', 6, 7, 6),
    (6, 'LASK Linz', 'Fenerbahçe SK', 8, 8, 4),
    (6, 'Liverpool FC', 'FC Porto', 3, 9, 10),
    (6, 'PSV', 'Club Atlético de Madrid', 7, 8, 5),
    (6, 'Racing Club de Lens', 'FK Bodø/Glimt', 4, 8, 8),
    (6, 'VfB Stuttgart', 'Lille OSC', 6, 7, 6),
    (7, 'FK Bodø/Glimt', 'Club Atlético de Madrid', 10, 8, 3),
    (7, 'Galatasaray SK', 'Feyenoord Rotterdam', 5, 8, 7),
    (7, 'PAE AEK', 'AS Roma', 10, 8, 3),
    (7, 'Aston Villa FC', 'Borussia Dortmund', 5, 8, 7),
    (7, 'FC Internazionale Milano', 'Liverpool FC', 5, 8, 7),
    (7, 'FC Porto', 'SK Slavia Praha', 2, 9, 11),
    (7, 'Lille OSC', 'ŠK Slovan Bratislava', 2, 9, 12),
    (7, 'Real Madrid CF', 'LASK Linz', 2, 10, 12),
    (7, 'VfB Stuttgart', 'Club Brugge KV', 5, 8, 7),
    (7, 'Fenerbahçe SK', 'Villarreal CF', 5, 8, 7),
    (7, 'Sabah FK', 'SSC Napoli', 12, 9, 2),
    (7, 'Como 1907', 'Paris Saint-Germain FC', 11, 9, 2),
    (7, 'Manchester United FC', 'FC Bayern München', 7, 8, 5),
    (7, 'RB Leipzig', 'FK Shakhtar Donetsk', 4, 8, 9),
    (7, 'Racing Club de Lens', 'Manchester City FC', 11, 9, 2),
    (7, 'Real Betis Balompié', 'Arsenal FC', 8, 8, 4),
    (7, 'Sporting Clube de Portugal', 'FC Barcelona', 8, 8, 4),
    (7, 'Viking FK', 'PSV', 10, 8, 3),
    (8, 'Arsenal FC', 'Sabah FK', 2, 10, 12),
    (8, 'AS Roma', 'Lille OSC', 4, 8, 9),
    (8, 'Club Atlético de Madrid', 'Fenerbahçe SK', 3, 9, 11),
    (8, 'Borussia Dortmund', 'PAE AEK', 2, 9, 12),
    (8, 'Club Brugge KV', 'FK Bodø/Glimt', 4, 8, 9),
    (8, 'FC Bayern München', 'Real Betis Balompié', 2, 9, 11),
    (8, 'FC Barcelona', 'Como 1907', 2, 9, 12),
    (8, 'FK Shakhtar Donetsk', 'Real Madrid CF', 11, 9, 3),
    (8, 'Feyenoord Rotterdam', 'RB Leipzig', 5, 8, 7),
    (8, 'LASK Linz', 'FC Porto', 10, 8, 3),
    (8, 'Liverpool FC', 'Racing Club de Lens', 2, 9, 12),
    (8, 'Manchester City FC', 'Sporting Clube de Portugal', 2, 9, 11),
    (8, 'Paris Saint-Germain FC', 'Galatasaray SK', 2, 9, 12),
    (8, 'PSV', 'VfB Stuttgart', 4, 8, 9),
    (8, 'SK Slavia Praha', 'Aston Villa FC', 9, 8, 4),
    (8, 'SSC Napoli', 'Viking FK', 2, 9, 12),
    (8, 'Villarreal CF', 'Manchester United FC', 6, 7, 6),
    (8, 'ŠK Slovan Bratislava', 'FC Internazionale Milano', 12, 9, 2)
)
update public.fixtures f
set home_win_points = supplied.home_points,
    draw_points = supplied.draw_points,
    away_win_points = supplied.away_points
from supplied
join public.teams home_team on home_team.name = supplied.home_name
join public.teams away_team on away_team.name = supplied.away_name
where f.season = 2026
  and f.stage = 'league_phase'
  and f.matchday = supplied.matchday
  and f.home_team_id = home_team.id
  and f.away_team_id = away_team.id;

-- If this database already contains the league phase, refuse a partial import.
-- Fresh databases have no fixtures yet; the UEFA importer writes these same
-- values when it creates them.
do $$
declare
  fixture_count integer;
  unpriced_count integer;
begin
  select count(*), count(*) filter (
    where home_win_points = 1 or draw_points = 1 or away_win_points = 1
  )
  into fixture_count, unpriced_count
  from public.fixtures
  where season = 2026 and stage = 'league_phase';

  if fixture_count > 0 and (fixture_count <> 144 or unpriced_count <> 0) then
    raise exception
      '2026/27 fixture point import incomplete: % fixtures, % without supplied points',
      fixture_count, unpriced_count;
  end if;
end;
$$;

-- Re-score any predictions that were settled before this migration.
update public.prediction_scores ps
set base_points = scored.points,
    correct_outcome = scored.correct_outcome,
    correct_goal_difference = scored.correct_goal_difference,
    exact_score = scored.exact_score,
    difficulty_multiplier = 1,
    stage_multiplier = 1,
    joker_multiplier = 1,
    total_points = scored.points,
    breakdown = jsonb_build_array(jsonb_build_object(
      'key', case
        when scored.exact_score then 'exactScore'
        when scored.correct_outcome then 'correctOutcome'
        else 'wrongOutcome'
      end,
      'value', scored.points
    )),
    settled_at = now()
from public.predictions p
join public.fixtures f on f.id = p.fixture_id
cross join lateral (
  select
    p.home_goals = f.home_goals and p.away_goals = f.away_goals as exact_score,
    sign(p.home_goals - p.away_goals) = sign(f.home_goals - f.away_goals)
      as correct_outcome,
    p.home_goals - p.away_goals = f.home_goals - f.away_goals
      as correct_goal_difference,
    case
      when p.home_goals = f.home_goals and p.away_goals = f.away_goals then
        2 * case
          when f.home_goals > f.away_goals then f.home_win_points
          when f.home_goals < f.away_goals then f.away_win_points
          else f.draw_points
        end
      when sign(p.home_goals - p.away_goals) = sign(f.home_goals - f.away_goals) then
        case
          when f.home_goals > f.away_goals then f.home_win_points
          when f.home_goals < f.away_goals then f.away_win_points
          else f.draw_points
        end
      else 0
    end::smallint as points
) scored
where ps.prediction_id = p.id
  and f.home_goals is not null
  and f.away_goals is not null;

-- Keep the existing admin RPC compatible for rules-note editing, but make its
-- re-score use per-fixture values rather than the retired global point fields.
create or replace function public.admin_set_game_settings(
  new_exact_points smallint,
  new_outcome_points smallint,
  new_rules_note_en text,
  new_rules_note_he text,
  admin_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.game_settings
  set rules_note_en = left(coalesce(new_rules_note_en, ''), 2000),
      rules_note_he = left(coalesce(new_rules_note_he, ''), 2000),
      updated_by = admin_user_id
  where id = 1;

  update public.prediction_scores ps
  set base_points = scored.points,
      correct_outcome = scored.correct_outcome,
      correct_goal_difference = scored.correct_goal_difference,
      exact_score = scored.exact_score,
      difficulty_multiplier = 1,
      stage_multiplier = 1,
      joker_multiplier = 1,
      total_points = scored.points,
      breakdown = jsonb_build_array(jsonb_build_object(
        'key', case
          when scored.exact_score then 'exactScore'
          when scored.correct_outcome then 'correctOutcome'
          else 'wrongOutcome'
        end,
        'value', scored.points
      )),
      settled_at = now()
  from public.predictions p
  join public.fixtures f on f.id = p.fixture_id
  cross join lateral (
    select
      p.home_goals = f.home_goals and p.away_goals = f.away_goals as exact_score,
      sign(p.home_goals - p.away_goals) = sign(f.home_goals - f.away_goals)
        as correct_outcome,
      p.home_goals - p.away_goals = f.home_goals - f.away_goals
        as correct_goal_difference,
      case
        when p.home_goals = f.home_goals and p.away_goals = f.away_goals then
          2 * case
            when f.home_goals > f.away_goals then f.home_win_points
            when f.home_goals < f.away_goals then f.away_win_points
            else f.draw_points
          end
        when sign(p.home_goals - p.away_goals) = sign(f.home_goals - f.away_goals) then
          case
            when f.home_goals > f.away_goals then f.home_win_points
            when f.home_goals < f.away_goals then f.away_win_points
            else f.draw_points
          end
        else 0
      end::smallint as points
  ) scored
  where ps.prediction_id = p.id
    and f.home_goals is not null
    and f.away_goals is not null;
end;
$$;
