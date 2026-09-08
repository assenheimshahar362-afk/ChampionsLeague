import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Materialises missing predictions for fixtures whose lock has passed.
 *
 * The database function owns eligibility, deterministic score generation and
 * conflict handling so concurrent page views can safely invoke this together.
 */
export async function ensureAutomaticPredictions(
  fixtureIds?: string[]
): Promise<number> {
  if (fixtureIds?.length === 0) return 0;

  const { data, error } = await createServiceRoleClient().rpc(
    "ensure_automatic_predictions",
    { target_fixture_ids: fixtureIds ?? null }
  );

  if (error) {
    throw new Error(`Creating automatic predictions failed: ${error.message}`);
  }

  return data ?? 0;
}
