import type { Metadata } from "next";
import { Geist, Geist_Mono, Rubik } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { AppBackground } from "@/components/app-background";
import { AccessibilityMenu } from "@/components/a11y/accessibility-menu";
import { SkipLink } from "@/components/a11y/skip-link";
import { BottomNav } from "@/components/bottom-nav";
import { InstallPrompt } from "@/components/install-prompt";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isLocale, localeDirection, locales } from "@/i18n/routing";
import { getPublicOrigin } from "@/lib/auth/origin";

import "../globals.css";

/* Latin UI face — a grotesque, per §8. */
const geistSans = Geist({ variable: "--font-app-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-app-mono", subsets: ["latin"] });

/* Geist has no Hebrew glyphs. Rubik covers both scripts and shares the
   geometric-grotesque character, so the two locales look like one product. */
const rubik = Rubik({ variable: "--font-app-sans", subsets: ["hebrew", "latin"] });

// Runs synchronously at the start of <body>, before the visible document is
// parsed, so saved accessibility preferences apply without a first-paint flash.
// A native inline script is intentional here: the outer app/layout.tsx is a
// passthrough and therefore cannot safely order a next/script instance.
const ACCESSIBILITY_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem('alufot.a11y-prefs');
    if (!saved) return;
    var preferences = JSON.parse(saved);
    var root = document.documentElement;
    var fontScale = ['md', 'lg', 'xl'].indexOf(preferences.fontScale) >= 0
      ? preferences.fontScale
      : 'md';
    root.dataset.a11yFontScale = fontScale;
    root.dataset.a11yContrast = String(!!preferences.contrast);
    root.dataset.a11yUnderlineLinks = String(!!preferences.underlineLinks);
    root.dataset.a11yMotion = preferences.reduceMotion ? 'reduce' : 'no-preference';
  } catch (error) {}
})();
`;

// Locale controls the document language, direction, font, and translations.
// Those must be resolved together before entering this root layout.
export const instant = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  const metadataBase = new URL(getPublicOrigin());

  return {
    metadataBase,
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
    applicationName: t("name"),
    openGraph: {
      type: "website",
      title: t("name"),
      description: t("tagline"),
      siteName: t("name"),
      locale: locale === "he" ? "he_IL" : "en_GB",
      images: [
        {
          url: "/alufot-og.jpg",
          width: 1200,
          height: 630,
          alt: "Alufot — Champions League predictions",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("name"),
      description: t("tagline"),
      images: ["/alufot-og.jpg"],
    },
    // iOS reads these rather than the manifest for a home-screen launch:
    // without `capable` the installed app opens in a Safari tab with the
    // address bar still on, which is not what the icon promised.
    appleWebApp: {
      capable: true,
      title: t("name"),
      statusBarStyle: "black",
    },
  };
}

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#030c22" },
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
  ],
  // The prediction steppers must not trigger zoom on double-tap, but pinch
  // zoom stays available — capping maximumScale would fail §8 accessibility.
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Opts this subtree into static rendering where possible.
  setRequestLocale(locale);

  const dir = localeDirection[locale];
  const bodyFont = locale === "he" ? rubik : geistSans;
  const accessibility = await getTranslations({ locale, namespace: "accessibility" });

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${bodyFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* The tab bar is fixed, so the page has to reserve its height or the
          footer's last line sits underneath it. Phones only, matching the bar. */}
      <body className="flex min-h-full flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <script
          id="accessibility-preferences"
          dangerouslySetInnerHTML={{ __html: ACCESSIBILITY_INIT_SCRIPT }}
        />
        <NextIntlClientProvider>
          <SkipLink label={accessibility("skipToContent")} />
          <AppBackground />
          <SiteHeader />
          <div
            id="main-content"
            tabIndex={-1}
            className="flex flex-1 flex-col outline-none"
          >
            {children}
          </div>
          <SiteFooter />
          <Suspense fallback={<BottomNavFallback />}>
            <BottomNav />
          </Suspense>
          <InstallPrompt />
          <AccessibilityMenu />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function BottomNavFallback() {
  return (
    <div
      aria-hidden="true"
      className="bg-background/85 fixed inset-x-0 bottom-0 z-40 h-14 border-t border-white/10 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    />
  );
}
