import assert from "node:assert/strict";
import test from "node:test";

import { countryCodeForNationality } from "./flags.ts";

test("maps provider nationality aliases to flags", () => {
  assert.equal(countryCodeForNationality("Ukraine"), "UA");
  assert.equal(countryCodeForNationality("DR Congo"), "CD");
  assert.equal(countryCodeForNationality("Cote d'Ivoire"), "CI");
  assert.equal(countryCodeForNationality("Türkiye"), "TR");
  assert.equal(countryCodeForNationality("England"), "GB-ENG");
  assert.equal(countryCodeForNationality("Northern Ireland"), "GB-NIR");
});

test("maps every nationality alias currently stored in squad data", () => {
  assert.equal(countryCodeForNationality("Azerbaijan"), "AZ");
  assert.equal(countryCodeForNationality("Curacao"), "CW");
  assert.equal(countryCodeForNationality("Kazakhstan"), "KZ");
  assert.equal(countryCodeForNationality("South Africa"), "ZA");
  assert.equal(countryCodeForNationality("The Gambia"), "GM");
  assert.equal(countryCodeForNationality("Tunisia"), "TN");
  assert.equal(countryCodeForNationality("Venezuela"), "VE");
});

test("returns no flag for missing or unknown nationality", () => {
  assert.equal(countryCodeForNationality(null), null);
  assert.equal(countryCodeForNationality(""), null);
  assert.equal(countryCodeForNationality("Unknown selection"), null);
});
