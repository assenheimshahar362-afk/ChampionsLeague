import { getTranslations, setRequestLocale } from "next-intl/server";
import { Goal, ListOrdered } from "lucide-react";
import { Suspense } from "react";

import { TeamCrest } from "@/components/match/team-crest";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { SchemaNotReadyError, getAllFixtures } from "@/lib/fixtures/queries";
import type { Fixture } from "@/lib/fixtures/types";
import {
  getTopScorers,
  type TopScorerRow,
} from "@/lib/standings/scorers";
import {
  buildStandings,
  qualificationFor,
  type Qualification,
} from "@/lib/standings/table";
import { cn } from "@/lib/utils";

/**
 * The Champions League table.
 *
 * Computed from fixtures the app has already released rather than fetched from
 * the provider — see lib/standings/table.ts for why that distinction is the
 * whole point on a replayed season.
 */
export default async function StandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);

  const t = await getTranslations("standings");
  const view = (await searchParams).view === "scorers" ? "scorers" : "table";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16">
      <PageHeader
        className="mt-8"
        title={t("title")}
        description={view === "scorers" ? t("scorers.subtitle") : t("subtitle")}
      />

      <StandingsTabs view={view} />

      <Suspense
        key={view}
        fallback={
          view === "scorers" ? <ScorersFallback /> : <StandingsFallback />
        }
      >
        {view === "scorers" ? (
          <ScorersContent locale={locale} />
        ) : (
          <StandingsContent locale={locale} />
        )}
      </Suspense>
    </main>
  );
}

function StandingsTabs({ view }: { view: "table" | "scorers" }) {
  const items = [
    ["table", ListOrdered, "tabs.table"],
    ["scorers", Goal, "tabs.scorers"],
  ] as const;

  return (
    <Suspense>
      <StandingsTabsContent view={view} items={items} />
    </Suspense>
  );
}

async function StandingsTabsContent({
  view,
  items,
}: {
  view: "table" | "scorers";
  items: readonly (readonly ["table" | "scorers", typeof Goal, string])[];
}) {
  const t = await getTranslations("standings");

  return (
    <nav
      aria-label={t("tabsLabel")}
      className="bg-card/45 mt-6 grid grid-cols-2 gap-1 rounded-xl border border-white/15 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-xl"
    >
      {items.map(([key, Icon, label]) => (
        <Button
          key={key}
          asChild
          variant="ghost"
          className={cn(
            "h-10 rounded-lg",
            view === key &&
              "border-primary/25 bg-primary/12 text-primary shadow-[0_5px_16px_rgb(2_7_28/0.12)]"
          )}
        >
          <Link
            href={{ pathname: "/standings", query: { view: key } }}
            aria-current={view === key ? "page" : undefined}
          >
            <Icon className="size-4" aria-hidden="true" />
            {t(label)}
          </Link>
        </Button>
      ))}
    </nav>
  );
}

async function StandingsContent({ locale }: { locale: string }) {
  const t = await getTranslations("standings");
  let fixtures: Fixture[] = [];
  try {
    fixtures = await getAllFixtures(locale);
  } catch (error) {
    if (!(error instanceof SchemaNotReadyError)) throw error;
    return <SetupNotice reason="schema" />;
  }

  const table = buildStandings(fixtures, locale);

  return (
    <>
      {table.length === 0 ? (
        <p className="text-muted-foreground mt-8 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-balance">
          {t("empty")}
        </p>
      ) : (
        <>
          <div className="bg-card/55 mt-6 overflow-hidden rounded-lg border border-white/15 backdrop-blur-xl">
            {/* Wide content scrolls inside its own box rather than pushing the
                page sideways. On a phone the last three columns are the ones
                that go, and they are the least load-bearing. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("title")}</caption>
                <thead>
                  <tr className="border-primary/20 bg-primary/10 border-b text-[11px]">
                    <Th className="w-9 text-center">{t("col.rank")}</Th>
                    <Th className="text-start">{t("col.club")}</Th>
                    <Th title={t("col.playedFull")}>{t("col.played")}</Th>
                    <Th className="hidden sm:table-cell" title={t("col.wonFull")}>
                      {t("col.won")}
                    </Th>
                    <Th className="hidden sm:table-cell" title={t("col.drawnFull")}>
                      {t("col.drawn")}
                    </Th>
                    <Th className="hidden sm:table-cell" title={t("col.lostFull")}>
                      {t("col.lost")}
                    </Th>
                    <Th
                      className="hidden md:table-cell"
                      title={t("col.goalsForFull")}
                    >
                      {t("col.goalsFor")}
                    </Th>
                    <Th
                      className="hidden md:table-cell"
                      title={t("col.goalsAgainstFull")}
                    >
                      {t("col.goalsAgainst")}
                    </Th>
                    <Th title={t("col.goalDifferenceFull")}>
                      {t("col.goalDifference")}
                    </Th>
                    <Th className="pe-3" title={t("col.pointsFull")}>
                      {t("col.points")}
                    </Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {table.map((row) => {
                    const band = qualificationFor(row.rank);
                    return (
                      <tr key={row.team.id}>
                        <td className="relative py-2 text-center">
                          {/* The band marker is a rule down the row's edge, not
                              a background tint: a tint on every row would fight
                              the glass surface the rest of the app is built on. */}
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute inset-y-0 start-0 w-[3px]",
                              bandColour(band)
                            )}
                          />
                          <span data-numeric className="text-xs font-semibold">
                            {row.rank}
                          </span>
                        </td>

                        <td className="py-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <TeamCrest
                              team={row.team}
                              className="size-6 shrink-0"
                            />
                            <span dir="auto" className="truncate font-medium">
                              {row.team.shortName}
                            </span>
                          </span>
                        </td>

                        <Td>{row.played}</Td>
                        <Td className="hidden sm:table-cell">{row.won}</Td>
                        <Td className="hidden sm:table-cell">{row.drawn}</Td>
                        <Td className="hidden sm:table-cell">{row.lost}</Td>
                        <Td className="hidden md:table-cell">{row.goalsFor}</Td>
                        <Td className="hidden md:table-cell">
                          {row.goalsAgainst}
                        </Td>
                        <Td>
                          {/* Signed, and forced LTR: "+3" flips to "3+" beside
                              right-to-left text without it. */}
                          <span dir="ltr">
                            {row.goalDifference > 0 ? "+" : ""}
                            {row.goalDifference}
                          </span>
                        </Td>
                        <Td className="pe-3 font-bold">{row.points}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* The bands mean nothing without this, and colour must never be the
              only carrier (§8) — so each one is spelled out. */}
          <ul className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {(["direct", "playoff", "eliminated"] as const).map((band) => (
              <li key={band} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn("h-3 w-[3px] rounded-full", bandColour(band))}
                />
                {t(`band.${band}`)}
              </li>
            ))}
          </ul>

        </>
      )}
    </>
  );
}

async function ScorersContent({ locale }: { locale: string }) {
  const t = await getTranslations("standings");
  let scorers: TopScorerRow[] = [];
  try {
    scorers = await getTopScorers(locale);
  } catch (error) {
    if (!(error instanceof SchemaNotReadyError)) throw error;
    return <SetupNotice reason="schema" />;
  }

  if (scorers.length === 0) {
    return (
      <p className="text-muted-foreground mt-6 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-balance">
        {t("scorers.empty")}
      </p>
    );
  }

  return (
    <div className="bg-card/55 mt-6 overflow-hidden rounded-lg border border-white/15 backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("scorers.caption")}</caption>
          <thead>
            <tr className="border-primary/20 bg-primary/10 border-b text-[11px]">
              <Th className="w-11 text-center">{t("col.rank")}</Th>
              <Th className="text-start">{t("scorers.player")}</Th>
              <Th className="hidden w-20 sm:table-cell">
                {t("scorers.assists")}
              </Th>
              <Th className="w-20 pe-3">{t("scorers.goals")}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {scorers.map((player) => (
              <ScorerRow key={player.candidateId} player={player} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScorerRow({ player }: { player: TopScorerRow }) {
  return (
    <tr className={cn(player.rank === 1 && "bg-warning/[0.045]")}>
      <td className="py-2.5 text-center">
        <span
          data-numeric
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-full text-xs font-bold",
            player.rank === 1
              ? "bg-warning/18 text-warning ring-1 ring-warning/25"
              : player.rank <= 3
                ? "bg-muted text-foreground"
                : "text-muted-foreground"
          )}
        >
          {player.rank}
        </span>
      </td>
      <td className="py-2.5">
        <span className="flex min-w-0 items-center gap-2.5">
          {player.team ? (
            <TeamCrest team={player.team} className="size-7 shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className="bg-muted size-7 shrink-0 rounded-full"
            />
          )}
          <span className="min-w-0">
            <span dir="auto" className="block truncate font-semibold">
              {player.name}
            </span>
            <span
              dir="auto"
              className="text-muted-foreground block truncate text-[11px]"
            >
              {player.teamName}
            </span>
          </span>
        </span>
      </td>
      <Td className="hidden sm:table-cell">{player.assists}</Td>
      <td data-numeric className="py-2.5 pe-3 text-center">
        <span className="text-primary text-base font-black tabular-nums">
          {player.goals}
        </span>
      </td>
    </tr>
  );
}

function StandingsFallback() {
  return (
    <div className="bg-card/55 mt-6 overflow-hidden rounded-lg border border-white/15">
      <div className="motion-safe:animate-pulse">
        <div className="bg-primary/10 h-9 border-b border-primary/20" />
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex h-10 items-center gap-3 border-b border-white/10 px-3 last:border-0">
            <span className="bg-muted size-5 rounded" />
            <span className="bg-muted h-3 w-32 rounded" />
            <span className="bg-muted ms-auto h-3 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScorersFallback() {
  return (
    <div className="bg-card/55 mt-6 overflow-hidden rounded-lg border border-white/15">
      <div className="motion-safe:animate-pulse">
        <div className="bg-primary/10 h-9 border-b border-primary/20" />
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="flex h-14 items-center gap-3 border-b border-white/10 px-3 last:border-0"
          >
            <span className="bg-muted size-7 rounded-full" />
            <span className="bg-muted size-7 rounded" />
            <span className="bg-muted h-3 w-32 rounded" />
            <span className="bg-muted ms-auto h-4 w-8 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function bandColour(band: Qualification): string {
  if (band === "direct") return "bg-success";
  if (band === "playoff") return "bg-warning";
  return "bg-muted-foreground/40";
}

function Th({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <th
      scope="col"
      // The abbreviations are the convention on every football table, but they
      // are not words — the full name rides along for anyone who needs it.
      className={cn(
        "text-muted-foreground w-8 py-1.5 text-center font-medium",
        className
      )}
    >
      {title ? <abbr title={title}>{children}</abbr> : children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td data-numeric className={cn("py-2 text-center text-xs", className)}>
      {children}
    </td>
  );
}
