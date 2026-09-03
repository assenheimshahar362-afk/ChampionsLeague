import { publicEnv } from "@/lib/env";

const PRODUCTION_FALLBACK_ORIGIN = "https://alufot.vercel.app";

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

/** Never derive an OAuth/email redirect destination from an HTTP Host header. */
export function getPublicOrigin(requestOrigin?: string): string {
  // PKCE cookies are origin-bound. When the flow starts on a loopback dev
  // server, its callback must finish on that same loopback origin instead of
  // jumping to a configured tunnel URL.
  if (
    process.env.NODE_ENV !== "production" &&
    requestOrigin &&
    isLoopbackOrigin(requestOrigin)
  ) {
    return new URL(requestOrigin).origin;
  }

  if (publicEnv.NEXT_PUBLIC_APP_URL) {
    return normalizedOrigin(publicEnv.NEXT_PUBLIC_APP_URL) ?? PRODUCTION_FALLBACK_ORIGIN;
  }

  // VERCEL_URL is the per-deployment host, which deployment protection blocks
  // for anonymous clients such as link scrapers. The production alias is the
  // only Vercel-provided host that is publicly reachable.
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const productionOrigin = normalizedOrigin(
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    );
    if (productionOrigin) return productionOrigin;
  }

  if (process.env.VERCEL_URL) {
    const vercelOrigin = normalizedOrigin(`https://${process.env.VERCEL_URL}`);
    if (vercelOrigin) return vercelOrigin;
  }

  return process.env.NODE_ENV === "production"
    ? PRODUCTION_FALLBACK_ORIGIN
    : "http://localhost:3000";
}
