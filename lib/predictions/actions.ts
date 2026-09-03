"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, getUser } from "@/lib/supabase/server";

/**
 * Prediction mutations.
 *
 * Server Functions are reachable by direct POST, not only through the UI, so
 * nothing here trusts the client: the user is re-read from the auth server, the
 * payload is parsed, and the kickoff lock is re-checked against the database.
 *
 * RLS enforces the same two rules independently — see the predictions policies
 * in 0001_init.sql. The checks below exist to turn a policy rejection into a
 * specific error code the UI can translate, rather than an opaque failure. They
 * are not the security boundary; the database is.
 */

/** Error codes, not sentences — the client translates these (§9). */
export type PredictionErrorCode =
  | "notSignedIn"
  | "invalidScore"
  | "unknownFixture"
  | "locked"
  | "generic";

export type PredictionState =
  | { status: "idle" }
  | { status: "saved"; fixtureId: string }
  | { status: "error"; code: PredictionErrorCode };

/**
 * A scoreline, not an arbitrary integer. The upper bound matches the CHECK on
 * public.predictions: a 900-goal prediction is an attack or a bug.
 */
const scoreSchema = z.coerce.number().int().min(0).max(20);

const predictionSchema = z.object({
  fixtureId: z.uuid(),
  homeGoals: scoreSchema,
  awayGoals: scoreSchema,
});

const autoPredictionSchema = z.object({
  mode: z.enum(["missing", "all"]),
  predictions: z.array(predictionSchema).max(200),
});

/**
 * Confirms the fixture exists and has not kicked off.
 *
 * Measured against `kickoff_at`, which is the rebased kickoff while a season is
 * being replayed — the same column the RLS policies use, so the two can never
 * disagree about whether a match is locked.
 */
async function assertOpen(
  fixtureId: string
): Promise<{ ok: true } | { ok: false; code: PredictionErrorCode }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fixtures")
    .select("id, kickoff_at, status")
    .eq("id", fixtureId)
    .maybeSingle();

  if (error) {
    console.error("assertOpen failed", error.message);
    return { ok: false, code: "generic" };
  }
  if (!data) return { ok: false, code: "unknownFixture" };

  if (new Date(data.kickoff_at).getTime() <= Date.now()) {
    return { ok: false, code: "locked" };
  }
  if (data.status !== "scheduled") return { ok: false, code: "locked" };

  return { ok: true };
}

export type PredictionInput = {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
};

export type AutoPredictionMode = "missing" | "all";

export type AutoPredictionResult =
  | { status: "saved"; predictions: PredictionInput[] }
  | { status: "error"; code: PredictionErrorCode };

/**
 * Creates or amends the caller's prediction for one fixture.
 *
 * Takes a plain object rather than FormData: the matchday list calls this
 * directly from a transition as the user edits, not through a form submission.
 * The argument still arrives over the wire from a client, so it is parsed here
 * exactly as FormData would be.
 */
export async function savePrediction(
  input: PredictionInput
): Promise<PredictionState> {
  const user = await getUser();
  if (!user) return { status: "error", code: "notSignedIn" };

  const parsed = predictionSchema.safeParse(input);

  if (!parsed.success) {
    const badFixture = parsed.error.issues.some((i) => i.path[0] === "fixtureId");
    return {
      status: "error",
      code: badFixture ? "unknownFixture" : "invalidScore",
    };
  }

  const { fixtureId, homeGoals, awayGoals } = parsed.data;

  const open = await assertOpen(fixtureId);
  if (!open.ok) return { status: "error", code: open.code };

  const supabase = await createClient();

  // `fixture_round` is omitted deliberately: the predictions_set_round trigger
  // fills it from the fixture, so a client can never claim a round its fixture
  // does not belong to.
  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: user.id,
      fixture_id: fixtureId,
      home_goals: homeGoals,
      away_goals: awayGoals,
    },
    { onConflict: "user_id,fixture_id" }
  );

  if (error) {
    // The RLS policy rejects a write after kickoff. Losing the race between
    // assertOpen and here is the expected way to land on this.
    if (error.code === "42501") {
      return { status: "error", code: "locked" };
    }
    console.error("savePrediction failed", error.message);
    return { status: "error", code: "generic" };
  }

  revalidatePath("/", "layout");
  return { status: "saved", fixtureId };
}

/**
 * Saves a complete automatic-pick pass in one database write.
 *
 * Open fixtures are selected again on the server, so a stale page cannot use
 * this shortcut to write a locked prediction. In `missing` mode the existing
 * rows are also re-read here rather than trusting the client's visible state.
 */
export async function saveAutoPredictions(input: {
  mode: AutoPredictionMode;
  predictions: PredictionInput[];
}): Promise<AutoPredictionResult> {
  const user = await getUser();
  if (!user) return { status: "error", code: "notSignedIn" };

  const parsed = autoPredictionSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalidScore" };
  if (parsed.data.predictions.length === 0) {
    return { status: "saved", predictions: [] };
  }

  const supabase = await createClient();
  const fixtureIds = parsed.data.predictions.map((prediction) => prediction.fixtureId);
  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixtures")
    .select("id, kickoff_at, status")
    .in("id", fixtureIds);

  if (fixtureError) {
    console.error("saveAutoPredictions fixture read failed", fixtureError.message);
    return { status: "error", code: "generic" };
  }

  const now = Date.now();
  const openIds = new Set(
    (fixtures ?? [])
      .filter(
        (fixture) =>
          fixture.status === "scheduled" &&
          new Date(fixture.kickoff_at).getTime() > now
      )
      .map((fixture) => fixture.id)
  );

  let writableIds = openIds;
  if (parsed.data.mode === "missing" && openIds.size > 0) {
    const { data: existing, error: existingError } = await supabase
      .from("predictions")
      .select("fixture_id")
      .eq("user_id", user.id)
      .in("fixture_id", [...openIds]);

    if (existingError) {
      console.error("saveAutoPredictions existing read failed", existingError.message);
      return { status: "error", code: "generic" };
    }
    const existingIds = new Set((existing ?? []).map((row) => row.fixture_id));
    writableIds = new Set([...openIds].filter((id) => !existingIds.has(id)));
  }

  const predictions = parsed.data.predictions.filter((prediction) =>
    writableIds.has(prediction.fixtureId)
  );
  if (predictions.length === 0) {
    return { status: "saved", predictions: [] };
  }

  const { error } = await supabase.from("predictions").upsert(
    predictions.map((prediction) => ({
      user_id: user.id,
      fixture_id: prediction.fixtureId,
      home_goals: prediction.homeGoals,
      away_goals: prediction.awayGoals,
    })),
    { onConflict: "user_id,fixture_id" }
  );

  if (error) {
    console.error("saveAutoPredictions failed", error.message);
    return {
      status: "error",
      code: error.code === "42501" ? "locked" : "generic",
    };
  }

  revalidatePath("/", "layout");
  return { status: "saved", predictions };
}
