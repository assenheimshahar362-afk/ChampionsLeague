import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type GameSettings = {
  /** Legacy fields retained only for compatibility with the existing admin RPC. */
  exactPoints: number;
  outcomePoints: number;
  rulesNoteEn: string;
  rulesNoteHe: string;
  updatedAt: string | null;
};

const FALLBACK_SETTINGS: GameSettings = {
  exactPoints: 3,
  outcomePoints: 1,
  rulesNoteEn: "",
  rulesNoteHe: "",
  updatedAt: null,
};

type SettingsRow = {
  exact_points: number;
  outcome_points: number;
  rules_note_en: string;
  rules_note_he: string;
  updated_at: string;
};

function toSettings(row: SettingsRow | null): GameSettings {
  if (!row) return FALLBACK_SETTINGS;
  return {
    exactPoints: row.exact_points,
    outcomePoints: row.outcome_points,
    rulesNoteEn: row.rules_note_en,
    rulesNoteHe: row.rules_note_he,
    updatedAt: row.updated_at,
  };
}

function isMissingSettings(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /Could not find the table/i.test(error.message ?? "")
  );
}

export async function getGameSettings(): Promise<GameSettings> {
  const db = await createClient();
  const { data, error } = await db
    .from("game_settings")
    .select("exact_points, outcome_points, rules_note_en, rules_note_he, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (isMissingSettings(error)) return FALLBACK_SETTINGS;
    throw new Error(`Loading game settings failed: ${error.message}`);
  }
  return toSettings(data);
}

export async function getGameSettingsAsAdmin(): Promise<GameSettings> {
  const { data, error } = await createServiceRoleClient()
    .from("game_settings")
    .select("exact_points, outcome_points, rules_note_en, rules_note_he, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (isMissingSettings(error)) return FALLBACK_SETTINGS;
    throw new Error(`Loading admin game settings failed: ${error.message}`);
  }
  return toSettings(data);
}
