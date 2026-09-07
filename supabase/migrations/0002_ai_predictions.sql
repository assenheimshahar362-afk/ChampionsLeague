-- AI match research, verified sources, and an atomic lifetime budget.
--
-- Safe to re-run from the Supabase SQL editor: development databases may
-- already contain objects from the former 0002 and 0003 migrations, while a
-- fresh production database creates them here.

-- Longer bilingual research summaries and clickable web-search sources.
alter table public.ai_match_predictions
  add column if not exists sources jsonb not null default '[]'::jsonb;

alter table public.ai_match_predictions
  drop constraint if exists ai_match_predictions_summary_en_check,
  drop constraint if exists ai_match_predictions_summary_he_check,
  drop constraint if exists ai_match_predictions_sources_check;

alter table public.ai_match_predictions
  add constraint ai_match_predictions_summary_en_check
    check (char_length(trim(summary_en)) between 1 and 900),
  add constraint ai_match_predictions_summary_he_check
    check (char_length(trim(summary_he)) between 1 and 900),
  add constraint ai_match_predictions_sources_check
    check (
      jsonb_typeof(sources) = 'array'
      and jsonb_array_length(sources) <= 6
    );

comment on column public.ai_match_predictions.sources is
  'Clickable web sources returned by the OpenAI web-search run.';

-- Reserve prediction budget atomically so overlapping cron runs cannot
-- overspend. Interrupted jobs are older than the route's five-minute limit
-- after ten minutes, so the next reservation safely clears those stale rows.
create table if not exists public.ai_prediction_usage (
  id                       uuid primary key default gen_random_uuid(),
  model                    text not null,
  fixture_id               uuid not null
                             references public.fixtures (id) on delete cascade,
  budget_charge_microusd   bigint not null check (budget_charge_microusd > 0),
  estimated_cost_microusd  bigint check (estimated_cost_microusd >= 0),
  input_tokens             integer check (input_tokens >= 0),
  cached_input_tokens      integer check (cached_input_tokens >= 0),
  output_tokens            integer check (output_tokens >= 0),
  web_search_calls         smallint check (web_search_calls >= 0),
  status                   text not null default 'reserved',
  created_at               timestamptz not null default now(),
  completed_at             timestamptz
);

alter table public.ai_prediction_usage
  drop constraint if exists ai_prediction_usage_status_check;

alter table public.ai_prediction_usage
  add constraint ai_prediction_usage_status_check
    check (status in ('reserved', 'completed'));

alter table public.ai_prediction_usage enable row level security;
revoke all on public.ai_prediction_usage from public, anon, authenticated;
grant all on public.ai_prediction_usage to service_role;

-- Remove abandoned reservations immediately when upgrading an existing
-- project; the function below also performs this cleanup on future claims.
delete from public.ai_prediction_usage
where status = 'reserved'
  and created_at < now() - interval '10 minutes';

create or replace function public.reserve_ai_prediction_budget(
  budget_microusd bigint,
  charge_microusd bigint,
  model_name text,
  prediction_fixture_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  committed_microusd bigint;
  reservation_id uuid;
begin
  if budget_microusd <= 0 or charge_microusd <= 0 then
    raise exception 'AI prediction budget values must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_prediction_budget', 0));

  delete from public.ai_prediction_usage
  where status = 'reserved'
    and created_at < now() - interval '10 minutes';

  select coalesce(sum(budget_charge_microusd), 0)
    into committed_microusd
  from public.ai_prediction_usage;

  if committed_microusd + charge_microusd > budget_microusd then
    return null;
  end if;

  insert into public.ai_prediction_usage (
    model,
    fixture_id,
    budget_charge_microusd
  ) values (
    model_name,
    prediction_fixture_id,
    charge_microusd
  )
  returning id into reservation_id;

  return reservation_id;
end;
$$;

revoke all on function public.reserve_ai_prediction_budget(bigint, bigint, text, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_prediction_budget(bigint, bigint, text, uuid)
  to service_role;

comment on table public.ai_prediction_usage is
  'Conservative budget reservations and measured usage for OpenAI predictions.';
