-- Allow the server readiness probe to read the activation timestamp.
-- Client roles remain excluded; prediction creation uses the definer RPC.
grant select on public.prediction_automation_config to service_role;
notify pgrst, 'reload schema';
