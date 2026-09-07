-- Store the complete token breakdown returned by OpenAI.
-- This is a separate migration because production may already have recorded
-- 0002 as applied; editing an applied migration does not run it again.
alter table public.ai_prediction_usage
  add column if not exists cache_write_tokens integer
    check (cache_write_tokens >= 0);

-- Make the new column immediately visible to Supabase's PostgREST API.
notify pgrst, 'reload schema';
