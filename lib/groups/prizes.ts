export const DEFAULT_PRIZE_DISTRIBUTION = [70, 20, 10] as const;
export const MAX_PRIZE_PLACES = 10;

export function parsePrizeDistribution(values: readonly unknown[]): number[] | null {
  if (values.length === 0 || values.length > MAX_PRIZE_PLACES) return null;

  const percentages = values.map((value) => {
    if (typeof value !== "string" || !/^\d{1,3}$/.test(value)) return null;
    const percentage = Number(value);
    return Number.isInteger(percentage) && percentage >= 1 && percentage <= 100
      ? percentage
      : null;
  });

  if (percentages.some((value) => value === null)) return null;
  const distribution = percentages as number[];
  return distribution.reduce((sum, percentage) => sum + percentage, 0) === 100
    ? distribution
    : null;
}

export function prizeDistributionFromRow(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const distribution = value.filter(
    (percentage): percentage is number =>
      typeof percentage === "number" &&
      Number.isInteger(percentage) &&
      percentage >= 1 &&
      percentage <= 100
  );
  return distribution.length === value.length &&
    distribution.length <= MAX_PRIZE_PLACES &&
    distribution.reduce((sum, percentage) => sum + percentage, 0) === 100
    ? distribution
    : [];
}

/**
 * Splits an integer pot without losing agorot to rounding. Remaining agorot
 * go to the places with the largest fractional remainders, then by rank.
 */
export function calculatePrizeAmounts(
  potAgorot: number,
  distribution: readonly number[]
): number[] {
  const exact = distribution.map((percentage, index) => ({
    index,
    value: (potAgorot * percentage) / 100,
  }));
  const amounts = exact.map(({ value }) => Math.floor(value));
  const remainder = potAgorot - amounts.reduce((sum, amount) => sum + amount, 0);

  const remainderOrder = [...exact].sort(
    (a, b) =>
      (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value)) ||
      a.index - b.index
  );
  for (let index = 0; index < remainder; index += 1) {
    amounts[remainderOrder[index].index] += 1;
  }

  return amounts;
}
