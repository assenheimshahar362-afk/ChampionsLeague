import type { WireMatch } from "@/lib/football-data/types";

export type ProjectedLineupPlayer = {
  providerPlayerId: number | null;
  name: string;
  number: number | null;
  position: string | null;
  formationRow: number | null;
};

export type ProjectedLineup = {
  schemaVersion: 2;
  sourceMatchId: number;
  sourceKickoffAt: string;
  sourceOpponent: string;
  formation: string | null;
  players: ProjectedLineupPlayer[];
};

export type FixtureProjectedLineups = {
  home: ProjectedLineup | null;
  away: ProjectedLineup | null;
};

function formationShape(formation: string | null | undefined): number[] | null {
  const parts = (formation ?? "").split("-").map(Number);
  return parts.length >= 2 &&
    parts.length <= 5 &&
    parts.every((part) => Number.isInteger(part) && part > 0) &&
    parts.reduce((sum, part) => sum + part, 0) === 10
    ? parts
    : null;
}

export function playersWithFormationRows<
  Player extends { position?: string | null },
>(
  lineup: Player[],
  formation: string | null | undefined
): Array<{ player: Player; row: number | null }> {
  const starters = lineup.slice(0, 11);
  const goalkeeperIndex = starters.findIndex((player) =>
    /goal|keeper/i.test(player.position ?? "")
  );
  const goalkeeper =
    goalkeeperIndex >= 0 ? starters[goalkeeperIndex] : starters[0];
  const outfield = starters.filter((_, index) =>
    goalkeeperIndex >= 0 ? index !== goalkeeperIndex : index !== 0
  );
  const shape = formationShape(formation);
  if (!goalkeeper || !shape || starters.length !== 11) {
    return starters.map((player) => ({ player, row: null }));
  }

  let offset = 0;
  return [
    { player: goalkeeper, row: 0 },
    ...shape.flatMap((count, index) => {
      const row = outfield
        .slice(offset, offset + count)
        .map((player) => ({ player, row: index + 1 }));
      offset += count;
      return row;
    }),
  ];
}

/** Selects one team's starting XI from a detailed historical match response. */
export function projectedLineupFromMatch(
  match: WireMatch,
  teamProviderId: number
): ProjectedLineup | null {
  const team =
    match.homeTeam.id === teamProviderId
      ? match.homeTeam
      : match.awayTeam.id === teamProviderId
        ? match.awayTeam
        : null;
  if (!team) return null;

  const opponent =
    match.homeTeam.id === teamProviderId ? match.awayTeam : match.homeTeam;
  const formation = team.formation ?? null;
  return {
    schemaVersion: 2,
    sourceMatchId: match.id,
    sourceKickoffAt: match.utcDate,
    sourceOpponent: opponent.shortName ?? opponent.name,
    formation,
    players: playersWithFormationRows(team.lineup ?? [], formation).map(
      ({ player, row }) => ({
        providerPlayerId: player.id,
        name: player.name ?? "Unknown",
        number: player.shirtNumber ?? null,
        position: player.position ?? null,
        formationRow: row,
      })
    ),
  };
}