import type { Metadata } from "next";
import { Accessibility, Mail, Phone, UserRound } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { isLocale } from "@/i18n/routing";

const ACCESSIBILITY_CONTACT = {
  nameHe: "שחר אסנהיים",
  nameEn: "Shahar Assenheim",
  phoneDisplay: "053-340-2610",
  phoneLink: "+972533402610",
  email: "assenheim.shahar@gmail.com",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = await getTranslations({ locale, namespace: "accessibility" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

type AccessibilityStatementPageProps = {
  params: Promise<{ locale: string }>;
};

export default function AccessibilityStatementPage({
  params,
}: AccessibilityStatementPageProps) {
  return (
    <Suspense fallback={<AccessibilityStatementSkeleton />}>
      <AccessibilityStatementContent params={params} />
    </Suspense>
  );
}

async function AccessibilityStatementContent({
  params,
}: AccessibilityStatementPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("accessibility");
  const contactName = locale === "he" ? ACCESSIBILITY_CONTACT.nameHe : ACCESSIBILITY_CONTACT.nameEn;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20">
      <article className="mt-8 overflow-hidden rounded-2xl border border-white/15 bg-card/55 shadow-[0_20px_60px_rgb(3_7_25/0.28),inset_0_1px_0_rgb(255_255_255/0.04)] backdrop-blur-xl">
        <header className="relative isolate overflow-hidden border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6">
          <span
            aria-hidden="true"
            className="from-primary/18 via-primary/[0.05] absolute inset-0 -z-10 bg-gradient-to-br to-transparent"
          />
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-floodlight uppercase">
            <Accessibility className="size-4" aria-hidden="true" />
            {t("eyebrow")}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
            {t("title")}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground text-pretty">
            {t("description")}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("updatedLabel")}: {t("updatedDate")}
          </p>
        </header>

        <div className="px-5 text-sm leading-7 sm:px-6 sm:text-base">
          <StatementSection title={t("commitmentTitle")}>
            <p>{t("commitmentBody")}</p>
            <p>{t("standardBody")}</p>
          </StatementSection>

          <StatementSection title={t("featuresTitle")}>
            <ul className="list-disc space-y-2 ps-5 marker:text-primary">
              <li>{t("features.keyboard")}</li>
              <li>{t("features.skipLink")}</li>
              <li>{t("features.structure")}</li>
              <li>{t("features.forms")}</li>
              <li>{t("features.images")}</li>
              <li>{t("features.zoom")}</li>
              <li>{t("features.motion")}</li>
              <li>{t("features.language")}</li>
            </ul>
          </StatementSection>

          <StatementSection title={t("menuTitle")}>
            <p>{t("menuBody")}</p>
          </StatementSection>

          <StatementSection title={t("arrangementsTitle")}>
            <p>{t("arrangementsBody")}</p>
          </StatementSection>

          <StatementSection title={t("limitationsTitle")}>
            <p>{t("limitationsBody")}</p>
          </StatementSection>

          <StatementSection title={t("reportTitle")}>
            <p>{t("reportBody")}</p>
            <p>{t("reportDetails")}</p>
          </StatementSection>

          <StatementSection title={t("contactTitle")}>
            <dl className="divide-y divide-white/10">
              <ContactRow
                icon={<UserRound className="size-5" aria-hidden="true" />}
                label={t("contactName")}
              >
                {contactName}
              </ContactRow>
              <ContactRow
                icon={<Phone className="size-5" aria-hidden="true" />}
                label={t("contactPhone")}
              >
                <a
                  href={`tel:${ACCESSIBILITY_CONTACT.phoneLink}`}
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  <bdi dir="ltr">{ACCESSIBILITY_CONTACT.phoneDisplay}</bdi>
                </a>
              </ContactRow>
              <ContactRow
                icon={<Mail className="size-5" aria-hidden="true" />}
                label={t("contactEmail")}
              >
                <a
                  href={`mailto:${ACCESSIBILITY_CONTACT.email}`}
                  className="break-all font-semibold text-primary underline underline-offset-4"
                >
                  <bdi dir="ltr">{ACCESSIBILITY_CONTACT.email}</bdi>
                </a>
              </ContactRow>
            </dl>
          </StatementSection>
        </div>
      </article>
    </main>
  );
}

function AccessibilityStatementSkeleton() {
  return (
    <main
      aria-hidden="true"
      className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20"
    >
      <div className="mt-8 min-h-[52rem] overflow-hidden rounded-2xl border border-white/15 bg-card/55 shadow-[0_20px_60px_rgb(3_7_25/0.28)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-5 py-6 sm:px-6">
          <div className="h-3 w-28 animate-pulse rounded-full bg-primary/20" />
          <div className="mt-4 h-8 w-52 animate-pulse rounded-lg bg-white/10" />
          <div className="mt-3 h-4 max-w-lg animate-pulse rounded bg-white/[0.07]" />
        </div>
        <div className="space-y-8 px-5 py-6 sm:px-6">
          {["intro", "features", "menu", "contact"].map((section) => (
            <div key={section}>
              <div className="h-5 w-44 animate-pulse rounded bg-white/10" />
              <div className="mt-4 h-3 w-full animate-pulse rounded bg-white/[0.06]" />
              <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function StatementSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-white/10 py-6 last:border-b-0">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}

function ContactRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-4">
      <dt className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="min-w-0 ps-12 font-semibold sm:ps-0">{children}</dd>
    </div>
  );
}
