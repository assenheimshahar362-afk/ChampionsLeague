// Read-only operational probe. Never prints credentials or participant data.
const env = process.env;
console.log(JSON.stringify({ rebase: env.REBASE_ENABLED, season: env.FOOTBALL_DATA_SEASON }));
async function probe(name, url, headers, summarize, options = {}) {
  try {
    const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(12000) });
    const body = await response.json();
    console.log(JSON.stringify({ name, status: response.status, result: response.ok ? summarize(body) : { code: body.code, message: body.message } }));
    if (!response.ok) process.exitCode = 1;
  } catch (error) { console.log(JSON.stringify({ name, error: error.message })); process.exitCode = 1; }
}
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
await probe("provider", (env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4") + "/competitions/CL/matches?dateFrom=2026-09-08&dateTo=2026-09-08", { "X-Auth-Token": env.FOOTBALL_DATA_API_TOKEN },
  body => ({ count: body.matches?.length, matches: body.matches?.map(m => ({ id: m.id, utcDate: m.utcDate, status: m.status, score: m.score, home: m.homeTeam.name, away: m.awayTeam.name })) }));
await probe("fixtures", env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/fixtures?select=id,football_data_id,kickoff_at,status,home_goals,away_goals&order=kickoff_at.asc&kickoff_at=gte.2026-09-08&limit=20", headers, body => body);
await probe("automation", env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/prediction_automation_config?select=enabled_at", headers, body => body);
await probe("pending-results", env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/fixture_results?select=fixture_id,status,released_at&released_at=is.null&limit=20", headers, body => body);
await probe("automation-rpc-empty", env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/ensure_automatic_predictions",
  { ...headers, "Content-Type": "application/json" }, body => body,
  { method: "POST", body: JSON.stringify({ target_fixture_ids: [] }) });
await probe("poll-state", env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/provider_poll_state?select=job,last_requested_at", headers, body => body);
