import "server-only";

import { timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env.server";

/**
 * Shared guard for the cron route handlers.
 *
 * These endpoints run ingestion and settlement under the service role, so an
 * unauthenticated caller reaching one could rewrite the fixture list or settle
 * the season early. They are protected by a shared secret rather than by a user
 * session, because the caller is a scheduler, not a person.
 */

/** Length-safe, then constant-time. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on a length mismatch, and the lengths themselves are
  // not secret, so compare them first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Accepts `Authorization: Bearer <secret>` (the convention Vercel Cron uses)
 * or an `x-cron-secret` header.
 */
export function isAuthorisedCron(request: Request): boolean {
  const expected = serverEnv().CRON_SECRET;

  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const custom = request.headers.get("x-cron-secret");

  const provided = bearer ?? custom;
  if (!provided) return false;

  return secretsMatch(provided, expected);
}

/** 401 body shared by the cron routes. Deliberately says nothing useful. */
export function unauthorised(): Response {
  return Response.json({ error: "unauthorised" }, { status: 401 });
}
