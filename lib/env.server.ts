import "server-only";
import { z } from "zod";

/**
 * Server-only environment.
 *
 * The `server-only` import above is the enforcement mechanism: if any Client
 * Component ever imports this module, the build fails rather than silently
 * shipping a service-role key to the browser (§11).
 *
 * Values are read lazily so that a missing API key does not break unrelated
 * pages — only the ingestion routes that actually need it.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Optional here so ordinary pages can render before provider setup. The
  // provider client raises a focused error only when a sync is requested.
  FOOTBALL_DATA_API_TOKEN: z.string().min(1).optional(),
  FOOTBALL_DATA_BASE_URL: z.url().default("https://api.football-data.org/v4"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5-mini"),
  CRON_SECRET: z.string().min(16, "use at least 16 characters"),
  APP_ADMIN_EMAILS: z.string().default(""),

  /**
   * The season to ingest, as Football-Data.org numbers it: the calendar year the
   * season STARTS in. 2024 is the 2024/25 campaign; 2026 is 2026/27.
   *
   * The live app defaults to 2026. Set 2024 with REBASE_ENABLED=true for a
   * compressed historical replay.
   */
  FOOTBALL_DATA_SEASON: z.coerce.number().int().min(2011).max(2100).default(2026),

  /**
   * Kickoff rebasing — see lib/fixtures/rebase.ts.
   *
   * Replays a finished season on a timeline starting now, so predictions can
   * actually be placed. Turn this OFF for a live season: with a real 2026/27
   * subscription the provider's kickoffs are already correct.
   */
  REBASE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Real season instant that maps onto ingest time. */
  REBASE_PIVOT: z.iso.datetime().default("2024-10-03T00:00:00.000Z"),
  /** Time compression: 1 is real time, 0.04 replays a season in ~10 days. */
  REBASE_SCALE: z.coerce.number().positive().default(0.04),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    FOOTBALL_DATA_API_TOKEN: process.env.FOOTBALL_DATA_API_TOKEN,
    FOOTBALL_DATA_BASE_URL: process.env.FOOTBALL_DATA_BASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    CRON_SECRET: process.env.CRON_SECRET,
    APP_ADMIN_EMAILS: process.env.APP_ADMIN_EMAILS,
    FOOTBALL_DATA_SEASON: process.env.FOOTBALL_DATA_SEASON,
    REBASE_ENABLED: process.env.REBASE_ENABLED,
    REBASE_PIVOT: process.env.REBASE_PIVOT,
    REBASE_SCALE: process.env.REBASE_SCALE,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment variables:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** Narrow accessor for the Supabase service role, used by cron + admin paths. */
export function serviceRoleKey(): string {
  return serverEnv().SUPABASE_SERVICE_ROLE_KEY;
}
