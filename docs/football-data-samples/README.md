# Football-Data.org samples

Run `node scripts/recon.mjs` after setting `FOOTBALL_DATA_API_TOKEN` to write
raw Football-Data.org v4 response bodies and headers here. The script spaces
calls by 6.2 seconds, keeping the sweep inside the free plan's 10 calls/minute.

The runtime code uses these endpoints:

- `/v4/competitions/CL/teams?season=YYYY`
- `/v4/competitions/CL/matches?season=YYYY`
- `/v4/competitions/CL/scorers?season=YYYY&limit=50` (optional Deep Data)
- `/v4/matches?ids=...` for the one-minute live poll
- `/v4/matches/{id}` for cached match details

Lineups, goals, bookings and substitutions are requested with the official
`X-Unfold-*` headers. The fields remain optional because the free plan does not
include Deep Data.
