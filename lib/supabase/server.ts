import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * Uses the anon key, so every query runs under the caller's RLS context — the
 * same policies that protect blind predictions apply on the server too. Use
 * `createServiceRoleClient` only for ingestion, which must bypass RLS.
 */
export async function createClient() {
  // Supabase Auth evaluates token expiry against the current clock while the
  // server client is created. Declare request-time rendering before that
  // happens so Cache Components never tries to prerender an unstable value.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session instead, so this is safe
            // to ignore.
          }
        },
      },
    }
  );
}

/**
 * Returns the signed-in user, or null.
 *
 * Always prefer this over reading the session from cookies directly: it
 * revalidates the JWT with the auth server rather than trusting a cookie the
 * client could have tampered with.
 */
export const getUser = cache(async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
