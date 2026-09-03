const COUNTRY_CODES: Readonly<Record<string, string>> = {
  albania: "AL", algeria: "DZ", angola: "AO", argentina: "AR",
  armenia: "AM", australia: "AU", austria: "AT", azerbaijan: "AZ",
  belgium: "BE",
  "bosnia-herzegovina": "BA", brazil: "BR", bulgaria: "BG",
  "burkina faso": "BF", cameroon: "CM", canada: "CA",
  "cape verde islands": "CV", colombia: "CO", "congo dr": "CD",
  "cote d'ivoire": "CI", croatia: "HR", curacao: "CW", curaçao: "CW",
  "czech republic": "CZ", "dr congo": "CD", denmark: "DK",
  "dominican republic": "DO", ecuador: "EC", egypt: "EG",
  finland: "FI", france: "FR", gabon: "GA", gambia: "GM",
  georgia: "GE", germany: "DE", ghana: "GH", greece: "GR",
  guadeloupe: "GP", guinea: "GN", "guinea-bissau": "GW", haiti: "HT",
  hungary: "HU", iceland: "IS", indonesia: "ID", ireland: "IE",
  italy: "IT", "ivory coast": "CI", jamaica: "JM", japan: "JP",
  kazakhstan: "KZ", kosovo: "XK", luxembourg: "LU", mali: "ML", mauritania: "MR",
  montenegro: "ME", morocco: "MA", mozambique: "MZ", netherlands: "NL",
  "new zealand": "NZ", nigeria: "NG", "north macedonia": "MK",
  "northern ireland": "GB", norway: "NO", panama: "PA", paraguay: "PY",
  peru: "PE", poland: "PL", portugal: "PT", romania: "RO", russia: "RU",
  rwanda: "RW", "saudi arabia": "SA", senegal: "SN", serbia: "RS",
  "sierra leone": "SL", slovakia: "SK", slovenia: "SI",
  "south africa": "ZA", "south korea": "KR", spain: "ES", sweden: "SE",
  switzerland: "CH", "the gambia": "GM", thailand: "TH", tunisia: "TN",
  turkey: "TR", turkiye: "TR", türkiye: "TR", usa: "US", ukraine: "UA",
  uruguay: "UY", uzbekistan: "UZ", venezuela: "VE",
};

const SUBDIVISION_CODES: Readonly<Record<string, string>> = {
  england: "GB-ENG",
  "northern ireland": "GB-NIR",
  scotland: "GB-SCT",
  wales: "GB-WLS",
};

/** Converts the provider's English nationality labels into stable flag image codes. */
export function countryCodeForNationality(nationality: string | null): string | null {
  if (!nationality) return null;
  const key = nationality.trim().toLocaleLowerCase();
  if (!key) return null;
  return SUBDIVISION_CODES[key] ?? COUNTRY_CODES[key] ?? null;
}
