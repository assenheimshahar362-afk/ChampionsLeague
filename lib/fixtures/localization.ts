import type { FixtureProviderDetails } from "@/lib/fixtures/detail-types";
import type { Fixture } from "@/lib/fixtures/types";

export type PlayerNameTranslations = {
  byProviderId: Readonly<Record<string, string>>;
  byNormalizedName: Readonly<Record<string, string>>;
};

const LATIN_CHARACTER_REPLACEMENTS: Record<string, string> = {
  æ: "ae",
  ð: "d",
  đ: "d",
  ł: "l",
  ø: "o",
  œ: "oe",
  þ: "th",
};

const CLUB_TOKENS =
  /\b(FC|CF|AC|SC|BSC|KV|SK|FK|CD|RC|AS|SS|US|BK|IF|AFC|CFC|SV|VFB|VFL|TSG|RB|LOSC|OSC)\b/gi;

const TEAM_TRANSLATION_ALIASES: Record<string, string> = {
  "pae aek": "aek athens",
  atleti: "atletico madrid",
  "atletico de madrid": "atletico madrid",
  bayern: "bayern munich",
  "bayern munchen": "bayern munich",
  betis: "real betis",
  "bod glimt": "bodo glimt",
  "club atletico de madrid": "atletico madrid",
  "como 1907": "como",
  inter: "inter milan",
  "internazionale milano": "inter milan",
  lask: "lask linz",
  "man united": "man utd",
  "manchester city": "man city",
  "manchester united": "man utd",
  "paris saint germain": "psg",
  "paris sg": "psg",
  "psv eindhoven": "psv",
  "real betis balompie": "real betis",
  "slavia praha": "slavia prague",
  "sporting clube de portugal": "sporting",
  "sporting cp": "sporting",
};

export function teamTranslationKey(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[æðđłøœþ]/g, (character) =>
      LATIN_CHARACTER_REPLACEMENTS[character] ?? character
    )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(CLUB_TOKENS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return TEAM_TRANSLATION_ALIASES[normalized] ?? normalized;
}

/**
 * Produces the same key for provider spelling variants such as Mbappé/Mbappe
 * and Sørloth/Sorloth. The original display value is never changed by this
 * function; it is only used to find a Hebrew name stored in the database.
 */
export function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[æðđłøœþ]/g, (character) =>
      LATIN_CHARACTER_REPLACEMENTS[character] ?? character
    )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function translatedPlayerName(
  name: string,
  providerId: number | null,
  translations: PlayerNameTranslations
): string {
  if (providerId !== null) {
    const byId = translations.byProviderId[String(providerId)];
    if (byId) return byId;
  }

  return translations.byNormalizedName[normalizePersonName(name)] ?? name;
}

/**
 * Applies the Hebrew player catalogue to provider detail snapshots. Unknown
 * players deliberately keep the provider name instead of showing a blank or
 * inventing a transliteration.
 */
export function localizeFixtureProviderDetails(
  details: FixtureProviderDetails | null,
  fixture: Fixture,
  translations: PlayerNameTranslations
): FixtureProviderDetails | null {
  if (!details) return null;

  return {
    ...details,
    lineups: details.lineups.map((lineup) => ({
      ...lineup,
      teamName:
        lineup.side === "home"
          ? fixture.homeTeam.name
          : fixture.awayTeam.name,
      starters: lineup.starters.map((player) => ({
        ...player,
        name: translatedPlayerName(player.name, player.id, translations),
      })),
      substitutes: lineup.substitutes.map((player) => ({
        ...player,
        name: translatedPlayerName(player.name, player.id, translations),
      })),
    })),
    events: details.events.map((event) => ({
      ...event,
      playerName: event.playerName
        ? translatedPlayerName(event.playerName, null, translations)
        : null,
      assistName: event.assistName
        ? translatedPlayerName(event.assistName, null, translations)
        : null,
    })),
    playerPerformances: details.playerPerformances.map((player) => ({
      ...player,
      name: translatedPlayerName(player.name, player.id, translations),
    })),
  };
}
