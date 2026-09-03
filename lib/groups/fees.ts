const MAX_ENTRY_FEE_AGOROT = 100_000_000;

/** Parse a user-entered ILS amount without floating-point rounding. */
export function parseEntryFeeAgorot(value: unknown): number | null {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [shekels, fraction = ""] = normalized.split(".");
  const amount = Number(shekels) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount <= MAX_ENTRY_FEE_AGOROT
    ? amount
    : null;
}
