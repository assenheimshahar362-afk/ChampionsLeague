export const MAX_GROUP_PAYMENT_NOTE_LENGTH = 160;
export const MAX_GROUP_PAYMENT_URL_LENGTH = 2_048;

export type GroupPaymentSettings = {
  bitUrl: string | null;
  payboxUrl: string | null;
  note: string | null;
};

export type GroupPaymentRow = {
  bit_payment_url: string | null;
  paybox_payment_url: string | null;
  payment_note: string | null;
};

export type GroupPaymentParseResult =
  | { success: true; data: GroupPaymentSettings }
  | { success: false };

const PAYMENT_HOSTS = {
  bit: new Set(["bitpay.co.il", "www.bitpay.co.il"]),
  paybox: new Set([
    "link.payboxapp.com",
    "links.payboxapp.com",
    "payboxapp.page.link",
  ]),
} as const;

function trimmed(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseHttpsPaymentUrl(
  value: string,
  provider?: keyof typeof PAYMENT_HOSTS
): string | null | undefined {
  if (!value) return null;
  if (value.length > MAX_GROUP_PAYMENT_URL_LENGTH) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      return undefined;
    }
    if (provider && !PAYMENT_HOSTS[provider].has(url.hostname.toLowerCase())) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parseGroupPaymentForm(
  formData: FormData
): GroupPaymentParseResult {
  const bitUrl = parseHttpsPaymentUrl(trimmed(formData.get("bitUrl")), "bit");
  const payboxUrl = parseHttpsPaymentUrl(
    trimmed(formData.get("payboxUrl")),
    "paybox"
  );
  const noteValue = trimmed(formData.get("paymentNote"));
  const note = noteValue || null;

  if (
    bitUrl === undefined ||
    payboxUrl === undefined ||
    (note?.length ?? 0) > MAX_GROUP_PAYMENT_NOTE_LENGTH ||
    (note !== null && !bitUrl && !payboxUrl)
  ) {
    return { success: false };
  }

  return { success: true, data: { bitUrl, payboxUrl, note } };
}

export function groupPaymentSettingsFromRow(
  row: GroupPaymentRow
): GroupPaymentSettings {
  const bitUrl = parseHttpsPaymentUrl(row.bit_payment_url ?? "", "bit") ?? null;
  const payboxUrl =
    parseHttpsPaymentUrl(row.paybox_payment_url ?? "", "paybox") ?? null;
  const note = row.payment_note?.trim() || null;

  return {
    bitUrl,
    payboxUrl,
    note: note && note.length <= MAX_GROUP_PAYMENT_NOTE_LENGTH ? note : null,
  };
}

export function hasConfiguredGroupPayment(
  payment: GroupPaymentSettings
): boolean {
  return Boolean(payment.bitUrl || payment.payboxUrl);
}
