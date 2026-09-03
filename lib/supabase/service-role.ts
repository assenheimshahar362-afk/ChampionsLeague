import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { serviceRoleKey } from "@/lib/env.server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client — bypasses RLS entirely.
 *
 * Only ingestion (cron route handlers) and settlement may use this. It is the
 * writer that turns football-provider responses into rows; nothing user-facing
 * should ever construct it.
 *
 * Guarded by `server-only`, so importing it from a Client Component is a build
 * error rather than a key leak (§11).
 */
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey(),
    {
      auth: {
        // No session persistence: this client is request-scoped and has no user.
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
