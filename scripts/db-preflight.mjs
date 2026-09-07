import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  throw new Error("Missing Supabase URL, service-role key, or anon key");
}

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  "ai_match_predictions",
  "ai_prediction_usage",
  "fixture_details",
  "fixture_recent_form",
  "fixture_results",
  "fixtures",
  "game_settings",
  "group_join_requests",
  "group_members",
  "groups",
  "prediction_scores",
  "predictions",
  "profiles",
  "provider_poll_state",
  "season_outcomes",
  "season_picks",
  "season_player_candidates",
  "season_team_candidates",
  "team_squad_players",
  "teams",
];

const failures = [];
for (const table of tables) {
  const { error } = await service.from(table).select("*", { head: true }).limit(1);
  if (error) failures.push(`${table}: ${error.code ?? "unknown"}`);
}

const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
const { count: staleReservations, error: staleError } = await service
  .from("ai_prediction_usage")
  .select("id", { count: "exact", head: true })
  .eq("status", "reserved")
  .lt("created_at", tenMinutesAgo);

const { error: sourcesError } = await service
  .from("ai_match_predictions")
  .select("sources")
  .limit(1);

const { data: anonymousUsage, error: anonymousUsageError } = await anon
  .from("ai_prediction_usage")
  .select("id")
  .limit(1);

const probeFixtureId = "00000000-0000-0000-0000-000000000000";
const { error: rpcProbeError } = await service.rpc(
  "reserve_ai_prediction_budget",
  {
    budget_microusd: 0,
    charge_microusd: 0,
    model_name: "preflight-probe",
    prediction_fixture_id: probeFixtureId,
  }
);

const rpcAvailable =
  rpcProbeError?.message?.includes("AI prediction budget values must be positive") ??
  false;
const usageHiddenFromAnonymous =
  anonymousUsageError?.code === "42501" ||
  (!anonymousUsageError &&
    Array.isArray(anonymousUsage) &&
    anonymousUsage.length === 0);

console.log(
  JSON.stringify(
    {
      reachableTables: tables.length - failures.length,
      expectedTables: tables.length,
      tableFailures: failures,
      sourcesColumnAvailable: !sourcesError,
      staleReservations: staleError ? null : staleReservations,
      staleReservationQueryOk: !staleError,
      migrationCleanupRequired: (staleReservations ?? 0) > 0,
      usageHiddenFromAnonymous,
      anonymousUsageRows: anonymousUsage?.length ?? null,
      anonymousUsageErrorCode: anonymousUsageError?.code ?? null,
      budgetRpcAvailable: rpcAvailable,
      budgetRpcProbeCode: rpcProbeError?.code ?? null,
    },
    null,
    2
  )
);

if (
  failures.length > 0 ||
  sourcesError ||
  staleError ||
  (staleReservations ?? 0) > 0 ||
  !rpcAvailable ||
  !usageHiddenFromAnonymous
) {
  process.exitCode = 1;
}
