"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeRelativePath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

export type OnboardingErrorCode =
  | "invalidNickname"
  | "nicknameTaken"
  | "notSignedIn"
  | "incomplete"
  | "locked"
  | "unknownCandidate"
  | "generic";

export type OnboardingState =
  | { status: "idle" }
  | {
      status: "error";
      code: OnboardingErrorCode;
      field: "nickname" | "champion" | "scorer" | "form";
      revision: number;
    };

const nicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .regex(/^[\p{L}\p{N} _.\-]+$/u)
  .refine((value) => /\p{L}/u.test(value));

const pickSchema = z.object({
  season: z.coerce.number().int().min(2011).max(2100),
  championCandidateId: z.coerce.number().int().positive(),
  topScorerCandidateId: z.coerce.number().int().positive(),
  locale: z.enum(["en", "he"]),
});

function errorState(
  code: OnboardingErrorCode,
  field: "nickname" | "champion" | "scorer" | "form",
  revision: number
): OnboardingState {
  return { status: "error", code, field, revision };
}

/**
 * Commits the entire first-run setup in one submission. Every value is
 * revalidated here because Server Functions are callable outside the UI.
 */
export async function completeOnboarding(
  _previous: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const revision = z.coerce.number().int().nonnegative().catch(0).parse(
    formData.get("revision")
  );
  const nickname = nicknameSchema.safeParse(formData.get("nickname"));
  if (!nickname.success) {
    return errorState("invalidNickname", "nickname", revision);
  }

  const picks = pickSchema.safeParse({
    season: formData.get("season"),
    championCandidateId: formData.get("championCandidateId"),
    topScorerCandidateId: formData.get("topScorerCandidateId"),
    locale: formData.get("locale"),
  });
  if (!picks.success) return errorState("incomplete", "form", revision);

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return errorState("notSignedIn", "form", revision);

  const { season, championCandidateId, topScorerCandidateId, locale } =
    picks.data;
  const [teamResult, playerResult, firstFixtureResult] = await Promise.all([
    db
      .from("season_team_candidates")
      .select("candidate_id, pick_points")
      .eq("season", season)
      .eq("candidate_id", championCandidateId)
      .maybeSingle(),
    db
      .from("season_player_candidates")
      .select("candidate_id, pick_points")
      .eq("season", season)
      .eq("candidate_id", topScorerCandidateId)
      .maybeSingle(),
    db
      .from("fixtures")
      .select("kickoff_at")
      .eq("season", season)
      .order("kickoff_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (teamResult.error || playerResult.error || firstFixtureResult.error) {
    console.error(
      "Validating onboarding failed",
      teamResult.error?.message ??
        playerResult.error?.message ??
        firstFixtureResult.error?.message
    );
    return errorState("generic", "form", revision);
  }
  if (!teamResult.data) {
    return errorState("unknownCandidate", "champion", revision);
  }
  if (!playerResult.data) {
    return errorState("unknownCandidate", "scorer", revision);
  }
  if (
    firstFixtureResult.data &&
    new Date(firstFixtureResult.data.kickoff_at).getTime() <= Date.now()
  ) {
    return errorState("locked", "form", revision);
  }

  const { error: profileError } = await db.from("profiles").upsert({
    id: user.id,
    display_name: nickname.data,
    nickname_confirmed_at: new Date().toISOString(),
  });

  if (profileError) {
    if (profileError.code === "23505") {
      return errorState("nicknameTaken", "nickname", revision);
    }
    console.error("Saving onboarding nickname failed", profileError.message);
    return errorState("generic", "form", revision);
  }

  const { error: picksError } = await db.rpc("save_my_season_pick", {
    target_season: season,
    target_champion_candidate_id: championCandidateId,
    target_top_scorer_candidate_id: topScorerCandidateId,
  });

  if (picksError) {
    if (picksError.code === "P0001") {
      return errorState("locked", "form", revision);
    }
    console.error("Saving onboarding season picks failed", picksError.message);
    return errorState("generic", "form", revision);
  }

  revalidatePath("/", "layout");
  redirect(
    safeRelativePath(String(formData.get("next") ?? ""), `/${locale}`)
  );
}
