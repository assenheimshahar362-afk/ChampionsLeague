import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Refreshes the auth session on every request and writes the rotated cookies
 * onto `response`.
 *
 * `response` is created by the next-intl middleware and passed in, so both
 * concerns share one response object. Writing cookies onto a second, discarded
 * response is the classic way to end up silently signed out.
 *
 * Returns the cookie-backed session user for optimistic redirects only. Pages,
 * actions, and RLS still perform the secure authorization checks.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Proxy also runs for Link prefetches. A network-backed getUser/profile check
  // here serializes every navigation before the page can start rendering.
  // getSession reads the cookie and refreshes an expired token when necessary;
  // its user is intentionally used only for this optimistic redirect.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { user: session?.user ?? null, response };
}
