import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

function supabaseStoragePatterns() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const shared = {
      protocol: url.protocol === "http:" ? ("http" as const) : ("https" as const),
      hostname: url.hostname,
      port: url.port,
    };
    return [
      { ...shared, pathname: "/storage/v1/object/public/avatars/**" },
      { ...shared, pathname: "/storage/v1/object/public/group-images/**" },
      { ...shared, pathname: "/storage/v1/object/public/player-images/**" },
      { ...shared, pathname: "/storage/v1/object/public/team-images/**" },
    ];
  } catch {
    return [];
  }
}

const storagePatterns = supabaseStoragePatterns();

function contentSecurityPolicy(): string {
  const isDevelopment = process.env.NODE_ENV !== "production";
  let supabaseOrigin = "";
  let supabaseWebSocketOrigin = "";
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    supabaseOrigin = url.origin;
    supabaseWebSocketOrigin = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
  } catch {
    // Environment validation reports the actionable configuration error.
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${supabaseOrigin} https://crests.football-data.org https://flagcdn.com https://img.uefa.com`,
    `connect-src 'self' ${supabaseOrigin} ${supabaseWebSocketOrigin}${isDevelopment ? " ws: http:" : ""}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ]
    .join("; ")
    .replace(/\s+/g, " ")
    .trim();
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Social link crawlers read only the initial document head. Group invite
  // metadata is dynamic, so it must be complete before any HTML is streamed.
  htmlLimitedBots: /.*/,
  experimental: {
    // The image itself is capped at 2 MiB in both the action and Supabase.
    // Multipart boundaries add a little overhead to the raw request body.
    serverActions: { bodySizeLimit: "2100kb" },
  },
  images: {
    // The provider host remains available while newly ingested crests await
    // migration. Player, team, and profile images otherwise live in public
    // Supabase Storage buckets owned by this project.
    remotePatterns: [
      { protocol: "https", hostname: "crests.football-data.org" },
      {
        protocol: "https",
        hostname: "img.uefa.com",
        pathname: "/imgml/stadium/**",
      },
      ...storagePatterns,
    ],
    // Next 16 only generates the qualities listed here, and warns on any other
    // value. 70 is what the full-bleed stadium background uses — it is a large
    // blurred image where the extra compression is invisible.
    qualities: [70, 75],
  },
  typescript: {
    // A type error must never reach production. §2: type safety is
    // non-negotiable.
    ignoreBuildErrors: false,
  },
};

export default withNextIntl(nextConfig);
