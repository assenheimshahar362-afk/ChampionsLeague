import { EyeOff, Lock, Medal, Target, Trophy } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";

import { isLocale } from "@/i18n/routing";
import { getGameSettings } from "@/lib/scoring/settings";

/**
 * How the game works.
 *
 * Match values are stored on each fixture. The global settings row remains the
 * source of the optional bilingual rules notice.
 */
type RulesPageProps = {
  params: Promise<{ locale: string }>;
};

export default function RulesPage({ params }: RulesPageProps) {
  return (
    <Suspense fallback={<RulesPageSkeleton />}>
      <RulesContent params={params} />
    </Suspense>
  );
}

async function RulesContent({
  params,
}: RulesPageProps) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);

  // The rules notice comes from Supabase through a cookie-aware server client.
  // Mark this subtree as request-time before that client (and its internal
  // clock) runs; the surrounding Suspense boundary keeps the static shell.
  await connection();

  const [t, settings] = await Promise.all([
    getTranslations("rules"),
    getGameSettings(),
  ]);
  const rulesNote = locale === "he" ? settings.rulesNoteHe : settings.rulesNoteEn;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16">
      <article className="mt-8 overflow-hidden rounded-2xl border border-white/15 bg-card/55 shadow-[0_20px_60px_rgb(3_7_25/0.28),inset_0_1px_0_rgb(255_255_255/0.04)] backdrop-blur-xl">
        <header className="relative isolate overflow-hidden border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6">
          <span
            aria-hidden="true"
            className="from-primary/18 via-primary/[0.05] absolute inset-0 -z-10 bg-gradient-to-br to-transparent"
          />
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {t("title")}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground text-pretty">
            {t("subtitle")}
          </p>
        </header>

        <div className="px-5 sm:px-6">
          {/* Per-fixture outcome values are shown on each match card. This
              section explains the calculation shared by every fixture. */}
          <section className="border-b border-white/10 py-6">
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-8">
              <Award
                points="2×"
                label={t("exact.title")}
                body={t("exact.body")}
              />
              <Award
                points={t("outcome.value")}
                label={t("outcome.title")}
                body={t("outcome.body")}
              />
            </div>

            <p className="mt-5 text-xs text-muted-foreground text-balance">
              {t("nothingElse")}
            </p>

            {rulesNote ? (
              <aside className="mt-5 border-s-2 border-primary ps-3 text-sm leading-relaxed whitespace-pre-line text-pretty">
                {rulesNote}
              </aside>
            ) : null}
          </section>

          <section className="border-b border-white/10 py-6">
            <h2 className="text-lg font-semibold tracking-tight">
              {t("howTitle")}
            </h2>

            <ul className="mt-3 divide-y divide-white/10">
              <Rule Icon={Target} title={t("predict.title")} body={t("predict.body")} />
              <Rule Icon={Medal} title={t("season.title")} body={t("season.body")} />
              <Rule Icon={Lock} title={t("lock.title")} body={t("lock.body")} />
              <Rule Icon={EyeOff} title={t("blind.title")} body={t("blind.body")} />
              <Rule Icon={Trophy} title={t("table.title")} body={t("table.body")} />
            </ul>
          </section>

          <p className="py-5 text-xs leading-relaxed text-muted-foreground/70 text-balance">
            {t("regulationTime")}
          </p>
        </div>
      </article>
    </main>
  );
}

function RulesPageSkeleton() {
  return (
    <main
      aria-hidden="true"
      className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16"
    >
      <div className="mt-8 min-h-[42rem] overflow-hidden rounded-2xl border border-white/15 bg-card/55 shadow-[0_20px_60px_rgb(3_7_25/0.28)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-5 py-6 sm:px-6">
          <div className="h-8 w-44 animate-pulse rounded-lg bg-white/10" />
          <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-white/[0.07]" />
        </div>
        <div className="px-5 py-6 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {["exact", "outcome"].map((item) => (
              <div key={item}>
                <div className="h-7 w-28 animate-pulse rounded bg-white/10" />
                <div className="mt-3 h-3 w-full animate-pulse rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
          <div className="mt-8 border-t border-white/10 pt-6">
            {["predict", "season", "lock", "privacy"].map((item) => (
              <div key={item} className="flex gap-3 border-b border-white/10 py-4">
                <div className="size-8 shrink-0 animate-pulse rounded-lg bg-primary/10" />
                <div className="flex-1">
                  <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-white/[0.06]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function Award({
  points,
  label,
  body,
}: {
  points: number | string;
  label: string;
  body: string;
}) {
  return (
    <div>
      <h2 className="flex items-baseline gap-1.5">
        <span data-numeric className="text-3xl leading-none font-bold">
          {points}
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </h2>
      <p className="mt-2 text-xs text-muted-foreground text-pretty">{body}</p>
    </div>
  );
}

function Rule({
  Icon,
  title,
  body,
}: {
  Icon: typeof Target;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3 py-3.5 first:pt-1 last:pb-0">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">{body}</p>
      </div>
    </li>
  );
}
