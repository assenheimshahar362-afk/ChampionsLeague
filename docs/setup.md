# Setup

What a human has to do before the app can run. Everything else is automated.

## 1. Supabase project

1. Create a project at <https://supabase.com/dashboard>.
2. Project Settings → **Data API** → copy the **Project URL**.
3. Project Settings → **API Keys** → copy the **anon / publishable** key and the
   **service_role / secret** key.
4. Put them in `.env.local` (copy `.env.example` first):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   APP_ADMIN_EMAILS=admin@example.com
   ```

> The `service_role` key bypasses every RLS policy in the database. It must
> never appear in a `NEXT_PUBLIC_` variable, and `lib/supabase/service-role.ts`
> imports `server-only` so that a Client Component importing it fails the build
> rather than shipping the key to a browser.

`APP_ADMIN_EMAILS` is a comma-separated allowlist. Those signed-in accounts can
open `/admin`, manage participants and groups, and override season-pick points.
It is server-only and must not use the `NEXT_PUBLIC_` prefix.

## 2. Apply the schema

The schema is versioned in `supabase/migrations/`. Apply every unapplied
migration in filename order with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```

`<ref>` is the subdomain of your project URL — the `<ref>` in
`https://<ref>.supabase.co`.

For a brand-new project, the CLI applies `0001_init.sql` and then the additive
migrations that follow it. `0001_init.sql` is a destructive reset: it drops and
recreates `public`, so never run it again against an existing project. Auth
accounts are preserved, but game data and manually edited profile fields are
erased.

If you use the dashboard **SQL Editor** for an existing project, run only the
contents of migration files that have not already been applied. In particular,
`0002_group_profiles_invites.sql`, `0003_link_aek_athens_translation.sql` and
`0004_group_payments.sql` are additive and do not reset existing users, groups
or predictions.

Confirm it worked - this should list sixteen tables:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

Expect `fixture_details`, `fixture_results`, `fixtures`, `game_settings`,
`group_join_requests`, `group_members`, `groups`, `prediction_scores`, `predictions`, `profiles`,
`provider_poll_state`, `season_outcomes`, `season_picks`,
`season_player_candidates`, `season_team_candidates`, and `teams`.

Then regenerate the database types — this replaces the hand-written placeholder
in `lib/supabase/database.types.ts`:

```bash
npx supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
```

## 3. Auth providers

### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services →
   **Credentials** → Create Credentials → **OAuth client ID** → Web application.
2. Authorised redirect URI — take this from the Supabase dashboard, it is the
   Supabase callback, not the app's:

   ```
   https://<ref>.supabase.co/auth/v1/callback
   ```

3. Supabase dashboard → Authentication → **Sign In / Providers** → Google →
   enable, paste the Client ID and Client Secret.

### Email + password

Authentication → **Sign In / Providers** → Email. Leave the provider enabled and
**"Confirm email"** on: signUpWithPassword() shows a "check your inbox" screen
and the account cannot sign in until that link is opened.

Supabase's built-in SMTP allows only a couple of messages an hour, which runs
out fast while testing signups. Either configure a real SMTP sender under
Authentication → Emails, or confirm test accounts by hand in the dashboard.

Minimum password length is 6, set in `lib/auth/constants.ts` and mirrored by
the project's own Supabase setting — raise them together or the form will
promise something the auth server rejects.

### Redirect URLs

Authentication → **URL Configuration**:

- Site URL: `http://localhost:3000` for local, the Vercel URL in production.
- Redirect URLs — add both, including the wildcard for preview deployments:

  ```
  http://localhost:3000/auth/callback
  https://<your-app>.vercel.app/auth/callback
  https://<your-app>-*.vercel.app/auth/callback
  ```

## 4. Remaining env vars

```
CRON_SECRET=<32+ random chars>     # openssl rand -base64 32
```

`NEXT_PUBLIC_APP_URL` is optional and usually best left unset. `getOrigin()`
derives the origin from the request Host header, falling back to Vercel's
`VERCEL_URL`; set it only to force a specific origin.

## 5. Football-Data.org

1. Register at <https://www.football-data.org/client/register>.
2. Copy the token into `.env.local` as `FOOTBALL_DATA_API_TOKEN` and set
   `FOOTBALL_DATA_SEASON=2026` for the live 2026/27 campaign.
3. Player photos and team crests are served from the public Supabase
   `player-images` and `team-images` buckets. When importing rows whose image
   URLs point elsewhere, copy the files into project-owned Storage once:

   ```
   PLAYER_CATALOG_SEASON=2026
   TEAM_CATALOG_SEASON=2026
   npm run migrate:player-photos
   npm run migrate:team-crests
   ```

   The commands are idempotent and verify that every populated image URL
   belongs to this Supabase project. Regular season ingestion never calls a
   separate image API, and it preserves team crest URLs already migrated to
   owned Storage.
4. Run the reconnaissance sweep — this is Milestone 0 and gates the data-source
   decision:

   ```bash
   node scripts/recon.mjs
   ```

   It writes raw v4 samples to `docs/football-data-samples/`, spacing calls by
   6.2 seconds to stay within the free plan's 10 requests/minute limit.

### Which season

Football-Data numbers a season by its starting year: `2026` is 2026/27 and
`2024` is 2024/25. Use `REBASE_ENABLED=false` for live data. A historical
2024 replay can still be compressed by setting `REBASE_ENABLED=true`; the live
poll is disabled automatically during a replay so known results cannot leak.

## 6. Ingest the season

Migrations must be applied first (§2) — ingestion writes fixtures, hidden
results, and the champion/top-scorer candidate lists.

```bash
npm run dev              # in one terminal
npm run ingest -- --dry  # plan the run: 3 API requests, no writes
npm run ingest           # for real
```

The CLI is a thin client for `POST /api/cron/ingest`; it needs the dev server up
because the API client and mappers import `server-only` and cannot run in a bare
Node process.

The report lists fetched teams/matches, skipped qualifying rounds, inserted or
updated fixtures, candidate pools, and the remaining provider quota. The scorer
pool is optional: Football-Data's free plan does not include Deep Data, so a
Deep Data plan is required to create a fresh top-scorer candidate list.

For the 2026/27 league phase, the confirmed UEFA fixture page and its backing
match feed can seed all eight matchdays before Football-Data exposes the new
season. The importer validates 144 matches, 18 per matchday, and includes each
fixture's UTC kickoff and UEFA-declared stadium:

```bash
npm run import:uefa-2026 -- --dry
npm run import:uefa-2026
```

The import is idempotent by home/away pairing for season 2026. A later regular
Football-Data ingest matches these rows by teams and kickoff, attaches its own
provider ids, and takes over live updates without replacing fixture ids.
Fixtures whose stadium has not yet been announced by UEFA are still imported
with a null venue and are filled by a later rerun once UEFA publishes it.

## 7. Live polling

`GET /api/cron/live` is the scheduler endpoint. Call it once per minute with
`Authorization: Bearer $CRON_SECRET`. It first checks the local schedule; when
no game is near kickoff or active, it stops without making a provider request.
Overlapping calls share a database claim, so Football-Data receives at most one
request per 55 seconds.

The match-detail page also calls `GET /api/matches/live` every 60 seconds while
the selected game is near kickoff or active. This is a viewer-driven fallback;
it uses the same database claim and stops after the match becomes `FINISHED`.
One `/v4/matches?ids=...` call updates every active Champions League match.

## 8. Settlement

Results are withheld in `fixture_results` and released only once a fixture's
(rebased) kickoff has passed — otherwise replaying a finished season would show
every user the result before they predicted.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/settle
```

The same job also awards the snapshotted champion and top-scorer points after
the final. It accepts joint top scorers and settles every pick only once.

Idempotent, so run it as often as you like. On a compressed replay
(`REBASE_SCALE=0.04`) matches finish about four minutes after kickoff, so a
schedule of every minute or two keeps the table moving.

## Moving to season 2026/27

For the live 2026/27 season:

```
FOOTBALL_DATA_SEASON=2026
REBASE_ENABLED=false
```

then re-run the ingest. Football-Data's free scores are delayed; lineups,
substitutions, bookings and goal details require a Deep Data subscription.

## Verifying

```bash
npm run dev
```

- `/` redirects to `/en`
- `/he` renders right-to-left with Hebrew copy
- After signing in, `/en/onboarding` requires one champion and one top scorer
  before continuing to the originally requested page.
- `/he/onboarding` renders the same flow right-to-left with Hebrew copy.
- A group manager can paste an HTTPS share link from bit and/or PayBox in the
  profile's group section. Members see the group's entry fee and leave the site
  to complete payment; the app never handles financial credentials or claims
  that the external transfer succeeded.
