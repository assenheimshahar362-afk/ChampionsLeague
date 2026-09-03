import assert from "node:assert/strict";
import test from "node:test";

import {
  groupPaymentSettingsFromRow,
  parseGroupPaymentForm,
  parseHttpsPaymentUrl,
} from "./payment.ts";

function paymentForm(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

test("accepts one or both HTTPS payment links", () => {
  const result = parseGroupPaymentForm(
    paymentForm({
      bitUrl: "https://www.bitpay.co.il/app/share-info?id=123",
      payboxUrl: "https://links.payboxapp.com/paybox-group",
      paymentNote: "Group contribution",
    })
  );

  assert.deepEqual(result, {
    success: true,
    data: {
      bitUrl: "https://www.bitpay.co.il/app/share-info?id=123",
      payboxUrl: "https://links.payboxapp.com/paybox-group",
      note: "Group contribution",
    },
  });
});

test("accepts a single payment provider", () => {
  const result = parseGroupPaymentForm(
    paymentForm({ payboxUrl: "https://link.payboxapp.com/pay" })
  );

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.bitUrl, null);
});

test("clears payment settings when every field is empty", () => {
  assert.deepEqual(parseGroupPaymentForm(paymentForm({})), {
    success: true,
    data: { bitUrl: null, payboxUrl: null, note: null },
  });
});

test("does not allow a note without a payment link", () => {
  assert.deepEqual(
    parseGroupPaymentForm(paymentForm({ paymentNote: "Pay me" })),
    { success: false }
  );
});

test("rejects insecure or credential-bearing payment URLs", () => {
  assert.equal(parseHttpsPaymentUrl("http://example.com/pay"), undefined);
  assert.equal(
    parseHttpsPaymentUrl("https://user:pass@example.com/pay"),
    undefined
  );
  assert.equal(parseHttpsPaymentUrl("javascript:alert(1)"), undefined);
});

test("rejects lookalike and unrelated payment hosts", () => {
  assert.deepEqual(
    parseGroupPaymentForm(
      paymentForm({ bitUrl: "https://www.bitpay.co.il.attacker.example/pay" })
    ),
    { success: false }
  );
  assert.deepEqual(
    parseGroupPaymentForm(
      paymentForm({ payboxUrl: "https://example.com/paybox" })
    ),
    { success: false }
  );
});

test("sanitizes stored settings before they are rendered as links", () => {
  assert.deepEqual(
    groupPaymentSettingsFromRow({
      bit_payment_url: "javascript:alert(1)",
      paybox_payment_url: "https://links.payboxapp.com/paybox",
      payment_note: "  Join the pool  ",
    }),
    {
      bitUrl: null,
      payboxUrl: "https://links.payboxapp.com/paybox",
      note: "Join the pool",
    }
  );
});
