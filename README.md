# Alufot

A production-oriented, bilingual UEFA Champions League prediction game built
with Next.js and Supabase. Players predict regulation-time scores, compete in
private groups, follow live results and compare their picks with a shared AI
participant.

## Features

- English and Hebrew interfaces with full RTL support.
- Email/password and Google authentication through Supabase Auth.
- Match predictions locked at kickoff by database RLS policies.
- Automatic fallback predictions for eligible players who miss kickoff.
- Private groups, invite links, entry-fee information and group leaderboards.
- Live match status, score refreshes and idempotent prediction settlement.
- Tournament champion and top-scorer picks.
- Cached bilingual AI match analysis with sources and a lifetime cost cap.
- Responsive, accessible and installable PWA interface.

## Technology

- [Next.js 16](https://nextjs.org/) App Router and React 19
- TypeScript with strict type checking
- Tailwind CSS 4 and Radix UI
- [next-intl](https://next-intl.dev/) for localization
- Supabase Postgres, Auth, Storage and Row Level Security
- Football-Data.org for competition data
- OpenAI Responses API for optional researched match predictions
- Vercel for hosting and scheduled ingestion

## Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project
- A Football-Data.org API token
- An OpenAI API key only when AI predictions are enabled

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and provide the required credentials:

   ```bash
   cp .env.example .env.local
   ```

3. Link Supabase and apply the schema:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   npm run db:preflight
   ```

4. Start the application:

   ```bash
   npm run dev
   ```

5. In another terminal, preview and run the initial data import:

   ```bash
   npm run ingest -- --dry
   npm run ingest
   ```

The application is available at <http://localhost:3000>. Locale detection
redirects to either `/en` or `/he`.

> The schema bootstrap drops and recreates the `public` schema. Use it for a
> new project only; never run it manually against a populated production
> database.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser-safe Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only administrative access |
| `FOOTBALL_DATA_API_TOKEN` | Yes | Football-Data.org authentication |
| `FOOTBALL_DATA_BASE_URL` | No | Provider API base URL |
| `FOOTBALL_DATA_SEASON` | Yes | Season start year, for example `2026` |
| `CRON_SECRET` | Yes | Protects ingestion, live and settlement routes |
| `APP_ADMIN_EMAILS` | Production | Comma-separated administrator allowlist |
| `OPENAI_API_KEY` | AI only | Generates researched AI predictions |
| `OPENAI_MODEL` | No | OpenAI model used by the prediction job |
| `OPENAI_PREDICTION_BUDGET_USD` | No | Lifetime AI prediction budget |
| `REBASE_ENABLED` | No | Enables compressed historical-season replay |
| `REBASE_PIVOT` / `REBASE_SCALE` | Replay only | Controls the replay timeline |
| `NEXT_PUBLIC_APP_URL` | No | Overrides automatic public-origin detection |

Never expose server credentials through a `NEXT_PUBLIC_` variable. See
[the setup guide](docs/setup.md) for provider, OAuth, scheduler and deployment
configuration.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm test` | Run the Node test suite |
| `npm run check` | Run type checking, linting and all tests |
| `npm run db:preflight` | Verify the deployed schema and service-role access |
| `npm run ingest -- --dry` | Preview an ingestion run |
| `npm run ingest` | Import the configured Champions League season |
| `npm run demo:locked-match` | Create a local locked-match demo |
| `npm run import:squad-csv` | Import licensed player data from CSV |

## Architecture

```text
app/                    Next.js pages, layouts and API routes
components/             Shared UI grouped by product feature
data/                   Versioned football model inputs
i18n/                   Locale routing and request configuration
lib/                    Domain logic and server integrations
messages/               English and Hebrew translations
public/                 Runtime images and PWA assets
scripts/                Operations, ingestion and QA utilities
supabase/migrations/    Single complete database bootstrap
docs/                   Setup guide and database diagram
```

The browser talks only to Next.js and the Supabase APIs allowed by RLS.
Provider tokens, the service-role key and OpenAI credentials remain in
server-only modules. Live updates use database-backed request claims to prevent
multiple server instances from exceeding provider rate limits.

## Database

The complete schema is defined in
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
It includes tables, constraints, indexes, triggers, RPC functions, storage
policies and RLS rules.

- [Database relationship documentation](docs/database-schema.md)
- [Database class diagram](docs/database-schema.png)
- [Detailed setup and operations guide](docs/setup.md)

## Scheduled jobs

The application exposes authenticated routes for:

- `/api/cron/ingest` — refresh season data.
- `/api/cron/live` — poll active matches.
- `/api/cron/settle` — release results and award points.
- `/api/cron/ai-predictions` — generate optional cached AI analysis.

`vercel.json` schedules only the daily ingestion job. Live polling and
settlement require a scheduler capable of minute-level execution.

## Quality checks

Run the complete local verification before deployment:

```bash
npm run check
npm run build
```

Tests cover scoring, standings, ingestion mapping, fixture scheduling,
localization, AI costs, prediction visibility and season outcomes.

## Deployment

Deploy the application to Vercel, configure the variables from
`.env.example`, configure Supabase Auth redirect URLs, and attach a scheduler
for live polling and settlement. Follow [docs/setup.md](docs/setup.md) for the
full production checklist.
