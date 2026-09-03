import { getRequestConfig } from "next-intl/server";

import { defaultLocale, isLocale } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Everything is stored in UTC (§9). Rendering timezone is the device's,
    // resolved on the client; this is only the server-render fallback.
    timeZone: "UTC",
  };
});
