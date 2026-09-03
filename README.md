# Alufot

A bilingual Champions League prediction game built with Next.js and Supabase.

## Run locally

1. Copy `.env.example` to `.env.local` and fill in the required values.
2. Install dependencies with `npm install`.
3. Start with `npm run dev` (`npm.cmd run dev` in restricted PowerShell).
4. Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Database setup, ingestion, cron jobs, and deployment are documented in
[`docs/setup.md`](docs/setup.md).
