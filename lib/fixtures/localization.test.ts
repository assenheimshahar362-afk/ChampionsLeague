import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  localizeFixtureProviderDetails,
  normalizePersonName,
  teamTranslationKey,
} from "./localization.ts";
import type { FixtureProviderDetails } from "./detail-types.ts";
import type { Fixture, Team } from "./types.ts";

function team(id: string, name: string): Team {
  return {
    id,
    name,
    shortName: name,
    code: id.toUpperCase(),
    color: "#000000",
    logoUrl: null,
  };
}

function fixture(): Fixture {
  return {
    id: "fixture",
    season: 2026,
    stage: "league_phase",
    round: "League Stage - 1",
    kickoffAt: "2026-09-08T16:45:00.000Z",
    venue: null,
    homeTeam: team("rma", "ריאל מדריד"),
    awayTeam: team("mci", "מנצ'סטר סיטי"),
    status: "scheduled",
    homeGoals: null,
    awayGoals: null,
    elapsedMinutes: null,
    outcomePoints: { home: 4, draw: 8, away: 6 },
  };
}

function details(): FixtureProviderDetails {
  return {
    providerStatus: "scheduled",
    elapsedMinutes: null,
    liveHomeGoals: null,
    liveAwayGoals: null,
    regulationHomeGoals: null,
    regulationAwayGoals: null,
    lineups: [
      {
        side: "home",
        teamName: "Real Madrid CF",
        formation: "4-3-3",
        coachName: null,
        coachPhotoUrl: null,
        starters: [
          {
            id: 9,
            name: "Kylian Mbappé",
            number: 9,
            position: "Centre-Forward",
            grid: "1:1",
          },
        ],
        substitutes: [],
      },
    ],
    statistics: [],
    events: [
      {
        minute: 20,
        extraMinute: null,
        side: "home",
        playerName: "Kylian Mbappé",
        assistName: "Unknown Player",
        type: "Goal",
        detail: "Regular",
      },
    ],
    playerPerformances: [
      {
        id: 9,
        side: "home",
        name: "Kylian Mbappé",
        photoUrl: null,
        number: 9,
        position: "Centre-Forward",
        minutes: 90,
        rating: 8.5,
        goals: 1,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
      },
    ],
  };
}

describe("fixture localization", () => {
  it("matches common provider and catalogue team spellings", () => {
    assert.equal(teamTranslationKey("PAE AEK"), "aek athens");
    assert.equal(teamTranslationKey("Como 1907"), "como");
    assert.equal(teamTranslationKey("Paris Saint-Germain FC"), "psg");
    assert.equal(teamTranslationKey("FC Bayern München"), "bayern munich");
    assert.equal(teamTranslationKey("Club Atlético de Madrid"), "atletico madrid");
    assert.equal(teamTranslationKey("FK Bodø/Glimt"), "bodo glimt");
    assert.equal(teamTranslationKey("SK Slavia Praha"), "slavia prague");
  });

  it("normalizes accented player spellings without changing display values", () => {
    assert.equal(normalizePersonName("Kylian Mbappé"), "kylian mbappe");
    assert.equal(normalizePersonName("Alexander Sørloth"), "alexander sorloth");
  });

  it("localizes lineup, event and performance player names with fallback", () => {
    const localized = localizeFixtureProviderDetails(details(), fixture(), {
      byProviderId: { "9": "קיליאן אמבפה" },
      byNormalizedName: { "kylian mbappe": "קיליאן אמבפה" },
    });

    assert.ok(localized);
    assert.equal(localized.lineups[0]?.teamName, "ריאל מדריד");
    assert.equal(localized.lineups[0]?.starters[0]?.name, "קיליאן אמבפה");
    assert.equal(localized.events[0]?.playerName, "קיליאן אמבפה");
    assert.equal(localized.events[0]?.assistName, "Unknown Player");
    assert.equal(localized.playerPerformances[0]?.name, "קיליאן אמבפה");
  });
});
