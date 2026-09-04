import { createClient } from "@/lib/supabase/server";

export async function GET(): Promise<Response> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, memberships, predictions, scores, seasonPicks] =
    await Promise.all([
      db.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      db.from("group_members").select("group_id, role, joined_at").eq("user_id", user.id),
      db.from("predictions").select("*").eq("user_id", user.id),
      db.from("prediction_scores").select("*").eq("user_id", user.id),
      db.from("season_picks").select("*").eq("user_id", user.id),
    ]);

  const failure = [profile, memberships, predictions, scores, seasonPicks].find(
    ({ error }) => error
  );
  if (failure?.error) {
    console.error("Exporting account data failed", failure.error.message);
    return Response.json({ error: "Export unavailable" }, { status: 500 });
  }

  const body = {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    profile: profile.data,
    groupMemberships: memberships.data ?? [],
    predictions: predictions.data ?? [],
    predictionScores: scores.data ?? [],
    seasonPicks: seasonPicks.data ?? [],
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="alufot-data-${user.id}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}