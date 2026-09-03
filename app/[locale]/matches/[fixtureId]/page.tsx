import {
  Activity,
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  CalendarDays,
  CircleDot,
  Clock,
  MapPin,
  Radio,
  Shield,
  Star,
  User,
  Users,
} from "lucide-react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { LiveMatchRefresh } from "@/components/match/live-match-refresh";
import { LocalKickoff } from "@/components/match/local-kickoff";
import { TeamCrest } from "@/components/match/team-crest";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import type {
  FixtureProviderDetails,
  MatchEvent,
  PlayerPerformance,
  TeamLineup,
} from "@/lib/fixtures/detail-types";
import { getFixtureProviderDetails } from "@/lib/fixtures/details";
import { localizeFixtureProviderDetails } from "@/lib/fixtures/localization";
import {
  getFixtureGroupPredictions,
  type FixtureGroupPredictions,
} from "@/lib/fixtures/group-predictions";
import {
  buildFixtureHistory,
  type FixtureHistory,
} from "@/lib/fixtures/history";
import {
  getAllFixtures,
  getFixtureById,
  getHebrewPlayerNames,
  SchemaNotReadyError,
} from "@/lib/fixtures/queries";
import { isInPlay, type Fixture, type Team } from "@/lib/fixtures/types";
import { roundLabelFor } from "@/lib/fixtures/labels";
import { projectedPoints } from "@/lib/scoring/engine";
import { getUser } from "@/lib/supabase/server";
import { isLivePollCandidate } from "@/lib/ingest/live-window";
import {
  getFixtureTeamSquads,
  type SquadPlayer,
  type TeamSquad,
} from "@/lib/teams/squads";
import { cn } from "@/lib/utils";
import { countryCodeForNationality } from "@/lib/countries/flags";

const STATISTICS = [
  ["ball_possession", "possession"],
  ["shots", "totalShots"],
  ["shots_on_goal", "shotsOnGoal"],
  ["corner_kicks", "corners"],
  ["saves", "saves"],
  ["fouls", "fouls"],
  ["offsides", "offsides"],
] as const;

export default async function MatchDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; fixtureId: string }>;
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const { locale, fixtureId } = await params;
  if (isLocale(locale)) setRequestLocale(locale);

  let fixture: Fixture | null;
  let allFixtures: Fixture[];
  try {
    [fixture, allFixtures] = await Promise.all([
      getFixtureById(fixtureId, locale),
      getAllFixtures(locale),
    ]);
  } catch (error) {
    if (error instanceof SchemaNotReadyError) {
      return <SetupNotice reason="schema" />;
    }
    throw error;
  }

  if (!fixture) notFound();

  const [providerDetails, user, playerNames, teamSquads] = await Promise.all([
    getFixtureProviderDetails(fixture),
    getUser(),
    locale === "he" && fixture.season !== undefined
      ? getHebrewPlayerNames(fixture.season)
      : Promise.resolve(null),
    getFixtureTeamSquads(fixture),
  ]);
  const details = playerNames
    ? localizeFixtureProviderDetails(providerDetails, fixture, playerNames)
    : providerDetails;
  const displayFixture = withProviderState(fixture, details);
  const live = isInPlay(displayFixture);
  const pollLiveData = shouldPollLiveData(displayFixture);
  const requestedGroup = (await searchParams).group;
  const requestedGroupId = Array.isArray(requestedGroup)
    ? requestedGroup[0]
    : requestedGroup;
  const groupPredictions =
    live && user
      ? await getFixtureGroupPredictions(user.id, fixture.id, requestedGroupId)
      : null;
  const history = buildFixtureHistory(allFixtures, fixture);
  const t = await getTranslations("matchDetails");
  const round = roundLabelFor(fixture.stage, fixture.round);
  const tMatch = await getTranslations("match");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20">
      <LiveMatchRefresh enabled={pollLiveData} />

      <Button asChild variant="ghost" size="sm" className="mt-5 -ms-2">
        <Link href="/#matches">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {t("back")}
        </Link>
      </Button>

      <MatchHero
        fixture={displayFixture}
        roundLabel={tMatch(`rounds.${round.key}`, round.values)}
        details={details}
      />

      {live ? (
        <LivePredictions
          fixture={displayFixture}
          data={groupPredictions}
          currentUserId={user?.id ?? null}
        />
      ) : null}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 space-y-5 lg:order-1">
          <LineupsSection
            fixture={fixture}
            details={details}
            squads={teamSquads}
          />
          <StatisticsSection fixture={fixture} details={details} />
          <EventsSection fixture={fixture} details={details} />
          <TopPerformers fixture={fixture} details={details} />
        </div>

        <aside className="order-1 space-y-5 lg:order-2">
          <VenueCard fixture={fixture} />
          <ForecastCard fixture={fixture} locale={locale} />
          <HistoryCard fixture={fixture} history={history} locale={locale} />
        </aside>
      </div>
    </main>
  );
}

function shouldPollLiveData(fixture: Fixture): boolean {
  return isLivePollCandidate({
    status: fixture.status,
    kickoffAt: fixture.kickoffAt,
  });
}

function withProviderState(
  fixture: Fixture,
  details: FixtureProviderDetails | null
): Fixture {
  if (!details) return fixture;
  const live =
    details.providerStatus === "live" || details.providerStatus === "halftime";

  return {
    ...fixture,
    status: details.providerStatus,
    elapsedMinutes: details.elapsedMinutes ?? fixture.elapsedMinutes,
    homeGoals: live
      ? details.liveHomeGoals
      : fixture.homeGoals ?? details.regulationHomeGoals,
    awayGoals: live
      ? details.liveAwayGoals
      : fixture.awayGoals ?? details.regulationAwayGoals,
  };
}

async function MatchHero({
  fixture,
  roundLabel,
  details,
}: {
  fixture: Fixture;
  roundLabel: string;
  details: FixtureProviderDetails | null;
}) {
  const t = await getTranslations("matchDetails");
  const live = isInPlay(fixture);
  const finished = fixture.status === "finished";

  return (
    <header className="bg-card/60 relative mt-4 overflow-hidden rounded-[2rem] border border-white/15 px-4 py-6 shadow-[0_22px_70px_rgb(3_7_25/0.28)] backdrop-blur-xl sm:px-8 sm:py-8">
      <div
        aria-hidden="true"
        className="from-primary/20 absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent"
      />

      <div className="relative text-center">
        <h1 className="sr-only">
          {t("pageTitle", {
            home: fixture.homeTeam.name,
            away: fixture.awayTeam.name,
          })}
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="bg-primary/10 text-primary rounded-full border border-primary/20 px-2.5 py-1 text-[0.68rem] font-semibold tracking-wide uppercase">
            {roundLabel}
          </span>
          {live ? (
            <span className="border-live/40 bg-live/10 text-live inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold">
              <span className="bg-live pulse-live size-1.5 rounded-full" />
              {t("status.live", { minute: fixture.elapsedMinutes ?? 0 })}
            </span>
          ) : finished ? (
            <span className="bg-success/10 text-success rounded-full border border-success/25 px-2.5 py-1 text-[0.68rem] font-semibold">
              {t("status.finished")}
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-8">
          <HeroTeam team={fixture.homeTeam} />

          <div className="flex min-w-20 flex-col items-center justify-center">
            {live || finished ? (
              <>
                <span
                  dir="ltr"
                  data-numeric
                  className="text-4xl leading-none font-bold tracking-tight tabular-nums sm:text-5xl"
                >
                  {fixture.homeGoals ?? "–"}
                  <span className="text-muted-foreground mx-2 font-light">:</span>
                  {fixture.awayGoals ?? "–"}
                </span>
                {fixture.wentToExtraTime ? (
                  <span className="text-muted-foreground mt-2 text-[0.65rem]">
                    {t("afterExtraTime")}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="bg-background/45 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold">
                <LocalKickoff iso={fixture.kickoffAt} dateStyle="compact" />
              </span>
            )}
          </div>

          <HeroTeam team={fixture.awayTeam} />
        </div>

        <div className="text-muted-foreground mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            <LocalKickoff iso={fixture.kickoffAt} />
          </span>
          {fixture.venue ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              <span dir="auto">
                {fixture.venue}
                {fixture.venueDetails?.city
                  ? ` · ${fixture.venueDetails.city}`
                  : ""}
              </span>
            </span>
          ) : null}
          {fixture.referee ? (
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" aria-hidden="true" />
              <span dir="auto">{fixture.referee}</span>
            </span>
          ) : null}
        </div>

        {!details && fixture.status === "scheduled" ? (
          <p className="text-muted-foreground mt-4 text-[0.7rem]">
            {t("detailsBeforeKickoff")}
          </p>
        ) : null}
      </div>
    </header>
  );
}

function HeroTeam({ team }: { team: Team }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <TeamCrest
        team={team}
        className="size-20 drop-shadow-[0_8px_18px_rgb(0_0_0/0.38)] sm:size-28"
      />
      <p dir="auto" className="text-center text-sm font-bold text-balance sm:text-xl">
        {team.name}
      </p>
    </div>
  );
}

async function LivePredictions({
  fixture,
  data,
  currentUserId,
}: {
  fixture: Fixture;
  data: FixtureGroupPredictions | null;
  currentUserId: string | null;
}) {
  const t = await getTranslations("matchDetails.predictions");

  return (
    <section
      id="group-predictions"
      className="border-live/30 bg-live/[0.055] mt-6 rounded-2xl border p-4 shadow-[0_0_28px_rgb(245_90_120/0.08)] sm:p-5"
    >
      <SectionTitle
        icon={<Radio className="text-live size-4" aria-hidden="true" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {!currentUserId ? (
        <div className="mt-5 rounded-xl border border-dashed p-5 text-center">
          <p className="text-muted-foreground text-sm">{t("signedOut")}</p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
        </div>
      ) : !data?.selectedGroup ? (
        <p className="text-muted-foreground mt-5 rounded-xl border border-dashed p-5 text-center text-sm">
          {t("noGroups")}
        </p>
      ) : (
        <>
          {data.groups.length > 1 ? (
            <nav aria-label={t("chooseGroup")} className="mt-4 overflow-x-auto">
              <div className="flex min-w-max gap-1.5">
                {data.groups.map((group) => {
                  const active = group.id === data.selectedGroup?.id;
                  return (
                    <Button
                      key={group.id}
                      asChild
                      size="sm"
                      variant={active ? "secondary" : "ghost"}
                    >
                      <Link
                        href={{
                          pathname: `/matches/${fixture.id}`,
                          query: { group: group.id },
                        }}
                        aria-current={active ? "page" : undefined}
                      >
                        <Users className="size-3.5" aria-hidden="true" />
                        {group.name}
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </nav>
          ) : (
            <p className="text-muted-foreground mt-4 text-xs">
              {data.selectedGroup.name}
            </p>
          )}

          <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.045] text-xs">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t("player")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-center font-medium">
                    {t("pick")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">
                    {t("livePoints")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {data.rows.map((row) => {
                  const hasPrediction =
                    row.homeGoals !== null && row.awayGoals !== null;
                  const points = hasPrediction
                    ? (projectedPoints(
                        {
                          fixtureId: fixture.id,
                          homeGoals: row.homeGoals!,
                          awayGoals: row.awayGoals!,
                        },
                        fixture
                      )?.totalPoints ?? 0)
                    : null;

                  return (
                    <tr
                      key={row.userId}
                      className={cn(
                        row.userId === currentUserId && "bg-primary/[0.06]"
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <span className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-white/15">
                            <ProfileAvatar
                              avatarUrl={row.avatarUrl}
                              seed={row.userId}
                              alt=""
                              sizes="32px"
                            />
                          </span>
                          <span dir="auto" className="min-w-0 truncate font-medium">
                            {row.nickname}
                            {row.userId === currentUserId ? (
                              <span className="text-primary ms-1.5 text-[0.65rem]">
                                {t("you")}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td dir="ltr" data-numeric className="px-3 py-2.5 text-center font-bold">
                        {hasPrediction ? `${row.homeGoals}:${row.awayGoals}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        {points === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="border-live/40 text-live inline-flex rounded-full border border-dashed px-2 py-0.5 text-xs font-semibold">
                            {points}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

async function LineupsSection({
  fixture,
  details,
  squads,
}: {
  fixture: Fixture;
  details: FixtureProviderDetails | null;
  squads: TeamSquad[];
}) {
  const t = await getTranslations("matchDetails.lineups");
  const lineups = details?.lineups ?? [];
  const teams = [
    { side: "home" as const, team: fixture.homeTeam },
    { side: "away" as const, team: fixture.awayTeam },
  ];
  const hasAnyPlayers = squads.some((squad) => squad.players.length > 0) || lineups.length > 0;

  return (
    <SectionCard>
      <SectionTitle
        icon={<Shield className="size-4" aria-hidden="true" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      {!hasAnyPlayers ? (
        <EmptyDetail>{t("unavailable")}</EmptyDetail>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {teams.map(({ side, team }) => {
            const squad = squads.find((row) => row.teamId === team.id);
            const lineup = lineups.find((row) => row.side === side);
            return squad?.players.length ? (
              <SquadCard
                key={side}
                squad={squad}
                lineup={lineup}
                team={team}
              />
            ) : lineup ? (
              <LineupCard key={side} lineup={lineup} team={team} />
            ) : (
              <MissingSquadCard key={side} team={team} />
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

const SQUAD_GROUPS = ["goalkeepers", "defenders", "midfielders", "forwards", "other"] as const;
type SquadGroup = (typeof SQUAD_GROUPS)[number];

function squadGroup(position: string | null): SquadGroup {
  const value = position?.toLowerCase() ?? "";
  if (value.includes("goal")) return "goalkeepers";
  if (value.includes("def")) return "defenders";
  if (value.includes("mid")) return "midfielders";
  if (value.includes("forward") || value.includes("offence") || value.includes("attack")) {
    return "forwards";
  }
  return "other";
}

function samePlayer(player: SquadPlayer, candidate: TeamLineup["starters"][number]): boolean {
  if (
    candidate.id !== null &&
    player.footballDataId !== null &&
    candidate.id === player.footballDataId
  ) return true;
  return candidate.name.trim().toLocaleLowerCase() === player.name.trim().toLocaleLowerCase();
}

function officialRole(
  player: SquadPlayer,
  lineup: TeamLineup | undefined
): "starter" | "substitute" | null {
  if (lineup?.starters.some((candidate) => samePlayer(player, candidate))) return "starter";
  if (lineup?.substitutes.some((candidate) => samePlayer(player, candidate))) {
    return "substitute";
  }
  return null;
}

async function SquadCard({
  squad,
  lineup,
  team,
}: {
  squad: TeamSquad;
  lineup: TeamLineup | undefined;
  team: Team;
}) {
  const t = await getTranslations("matchDetails.lineups");
  const grouped = SQUAD_GROUPS.map((group) => ({
    group,
    players: squad.players
      .filter((player) => squadGroup(player.position) === group)
      .sort(
        (a, b) =>
          (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999) ||
          a.name.localeCompare(b.name)
      ),
  })).filter((group) => group.players.length > 0);

  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
      <header className="relative flex items-center gap-3 overflow-hidden border-b border-white/10 px-3.5 py-3.5">
        <span
          className="pointer-events-none absolute inset-y-0 start-0 w-1 opacity-90"
          style={{ backgroundColor: team.color }}
          aria-hidden="true"
        />
        <TeamCrest team={team} className="size-10" />
        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="truncate text-sm font-semibold">
            {team.name}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-[0.68rem]">
            {t("rosterCount", { count: squad.players.length })}
            {lineup?.coachName ? ` · ${t("coach", { name: lineup.coachName })}` : ""}
          </p>
        </div>
        {lineup?.formation ? (
          <span
            dir="ltr"
            data-numeric
            className="bg-primary/10 text-primary rounded-full border border-primary/15 px-2 py-1 text-xs font-bold"
          >
            {lineup.formation}
          </span>
        ) : null}
      </header>

      <div className="divide-y divide-white/[0.07]">
        {grouped.map(({ group, players }) => (
          <section key={group} className="px-3.5 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-muted-foreground text-[0.65rem] font-bold tracking-[0.16em] uppercase">
                {t(group)}
              </h4>
              <span data-numeric className="text-muted-foreground text-[0.65rem] tabular-nums">
                {players.length}
              </span>
            </div>
            <ul className="space-y-1.5">
              {players.map((player) => {
                const role = officialRole(player, lineup);
                const nationalityCode = countryCodeForNationality(player.nationality);
                return (
                  <li
                    key={player.id}
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5",
                      role === "starter"
                        ? "border-live/25 bg-live/[0.07]"
                        : "border-transparent bg-white/[0.025]"
                    )}
                  >
                    <PlayerPortrait player={player} />
                    <span data-numeric className="text-muted-foreground w-5 shrink-0 text-center text-[0.68rem] tabular-nums">
                      {player.shirtNumber ?? "–"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-start text-xs font-medium">
                      <bdi>{player.name}</bdi>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {nationalityCode ? (
                        <span
                          role="img"
                          aria-label={player.nationality ?? undefined}
                          title={player.nationality ?? undefined}
                          className="h-3.5 w-5 rounded-[2px] bg-cover bg-center shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
                          style={{
                            backgroundImage: `url(https://flagcdn.com/w40/${nationalityCode.toLowerCase()}.png)`,
                          }}
                        />
                      ) : null}
                      {role ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold",
                            role === "starter"
                              ? "bg-live/15 text-live"
                              : "bg-white/10 text-muted-foreground"
                          )}
                        >
                          {t(role)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}

function PlayerPortrait({ player }: { player: SquadPlayer }) {
  return (
    <span className="bg-muted relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10">
      {player.photoUrl ? (
        <Image
          src={player.photoUrl}
          alt=""
          fill
          sizes="32px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <User className="text-muted-foreground size-4" aria-hidden="true" />
      )}
    </span>
  );
}

async function MissingSquadCard({ team }: { team: Team }) {
  const t = await getTranslations("matchDetails.lineups");
  return (
    <article className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-3">
        <TeamCrest team={team} className="size-9" />
        <h3 dir="auto" className="truncate text-sm font-semibold">{team.name}</h3>
      </div>
      <p className="text-muted-foreground mt-4 text-center text-xs">{t("teamUnavailable")}</p>
    </article>
  );
}

async function LineupCard({ lineup, team }: { lineup: TeamLineup; team: Team }) {
  const t = await getTranslations("matchDetails.lineups");
  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
      <header className="flex items-center gap-3 border-b border-white/10 px-3.5 py-3">
        <TeamCrest team={team} className="size-9" />
        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="truncate text-sm font-semibold">
            {team.name}
          </h3>
          {lineup.coachName ? (
            <p dir="auto" className="text-muted-foreground mt-0.5 text-[0.68rem]">
              {t("coach", { name: lineup.coachName })}
            </p>
          ) : null}
        </div>
        {lineup.formation ? (
          <span dir="ltr" data-numeric className="bg-primary/10 text-primary rounded-full px-2 py-1 text-xs font-bold">
            {lineup.formation}
          </span>
        ) : null}
      </header>

      <ol className="divide-y divide-white/[0.07] px-3.5">
        {lineup.starters.map((player) => (
          <li key={player.id ?? player.name} className="flex items-center gap-2 py-2 text-sm">
            <span data-numeric className="text-muted-foreground w-6 shrink-0 text-center text-xs tabular-nums">
              {player.number ?? "–"}
            </span>
            <span dir="auto" className="min-w-0 flex-1 truncate font-medium">
              {player.name}
            </span>
            {player.position ? (
              <span className="text-muted-foreground text-[0.65rem]">
                {player.position}
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {lineup.substitutes.length > 0 ? (
        <details className="border-t border-white/10">
          <summary className="ease-snap cursor-pointer px-3.5 py-2.5 text-xs font-medium transition-transform duration-150 active:scale-[0.99]">
            {t("substitutes", { count: lineup.substitutes.length })}
          </summary>
          <ul className="grid grid-cols-2 gap-x-3 border-t border-white/[0.07] px-3.5 py-2">
            {lineup.substitutes.map((player) => (
              <li key={player.id ?? player.name} className="flex min-w-0 items-center gap-1.5 py-1.5 text-xs">
                <span data-numeric className="text-muted-foreground w-5 shrink-0">
                  {player.number ?? "–"}
                </span>
                <span dir="auto" className="truncate">{player.name}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

async function StatisticsSection({
  fixture,
  details,
}: {
  fixture: Fixture;
  details: FixtureProviderDetails | null;
}) {
  const t = await getTranslations("matchDetails.statistics");
  const home = details?.statistics.find((row) => row.side === "home")?.values;
  const away = details?.statistics.find((row) => row.side === "away")?.values;
  const rows = STATISTICS.flatMap(([providerKey, translationKey]) => {
    const homeValue = home?.[providerKey] ?? null;
    const awayValue = away?.[providerKey] ?? null;
    return homeValue === null && awayValue === null
      ? []
      : [{ providerKey, translationKey, homeValue, awayValue }];
  });

  return (
    <SectionCard>
      <SectionTitle
        icon={<Activity className="size-4" aria-hidden="true" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      {rows.length === 0 ? (
        <EmptyDetail>{t("unavailable")}</EmptyDetail>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-semibold">
            <span dir="auto" className="truncate text-start">{fixture.homeTeam.shortName}</span>
            <span className="text-muted-foreground">{t("metric")}</span>
            <span dir="auto" className="truncate text-end">{fixture.awayTeam.shortName}</span>
          </div>
          {rows.map((row) => (
            <StatisticRow
              key={row.providerKey}
              label={t(row.translationKey)}
              home={row.homeValue}
              away={row.awayValue}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function StatisticRow({
  label,
  home,
  away,
}: {
  label: string;
  home: string | number | null;
  away: string | number | null;
}) {
  const homeNumber = numericStat(home);
  const awayNumber = numericStat(away);
  const total = Math.max(homeNumber + awayNumber, 1);

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
        <span dir="ltr" data-numeric className="text-start font-bold tabular-nums">
          {home ?? "–"}
        </span>
        <span className="text-muted-foreground min-w-24 text-center text-xs">
          {label}
        </span>
        <span dir="ltr" data-numeric className="text-end font-bold tabular-nums">
          {away ?? "–"}
        </span>
      </div>
      <div dir="ltr" className="mt-1.5 grid grid-cols-2 gap-1">
        <span className="bg-white/[0.06] flex h-1.5 justify-end overflow-hidden rounded-s-full">
          <span
            className="bg-primary h-full rounded-s-full"
            style={{ width: `${(homeNumber / total) * 100}%` }}
          />
        </span>
        <span className="bg-white/[0.06] h-1.5 overflow-hidden rounded-e-full">
          <span
            className="bg-secondary block h-full rounded-e-full"
            style={{ width: `${(awayNumber / total) * 100}%` }}
          />
        </span>
      </div>
    </div>
  );
}

function numericStat(value: string | number | null): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function EventsSection({
  fixture,
  details,
}: {
  fixture: Fixture;
  details: FixtureProviderDetails | null;
}) {
  const t = await getTranslations("matchDetails.events");
  const events = details?.events ?? [];

  return (
    <SectionCard>
      <SectionTitle
        icon={<Clock className="size-4" aria-hidden="true" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      {events.length === 0 ? (
        <EmptyDetail>{t("unavailable")}</EmptyDetail>
      ) : (
        <ol className="relative mt-5 space-y-2 before:absolute before:inset-y-3 before:start-[2.15rem] before:w-px before:bg-white/10">
          {events.map((event, index) => (
            <EventRow
              key={`${event.minute}-${event.type}-${event.playerName}-${index}`}
              event={event}
              fixture={fixture}
            />
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

async function EventRow({ event, fixture }: { event: MatchEvent; fixture: Fixture }) {
  const t = await getTranslations("matchDetails.events");
  const team =
    event.side === "home"
      ? fixture.homeTeam
      : event.side === "away"
        ? fixture.awayTeam
        : null;
  const isGoal = event.type === "Goal";
  const isSubstitution = event.type === "subst";
  const isCard = event.type === "Card";
  const red = /red/i.test(event.detail);
  const label = isGoal
    ? t("goal")
    : isSubstitution
      ? t("substitution")
      : isCard
        ? red
          ? t("redCard")
          : t("yellowCard")
        : event.detail;

  return (
    <li className="relative grid grid-cols-[4.3rem_minmax(0,1fr)] items-start gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.025]">
      <span className="relative z-10 flex items-center justify-between gap-1">
        <span dir="ltr" data-numeric className="text-muted-foreground text-xs font-semibold tabular-nums">
          {event.minute}
          {event.extraMinute ? `+${event.extraMinute}` : ""}&apos;
        </span>
        <span className="bg-card flex size-6 items-center justify-center rounded-full border border-white/15">
          {isGoal ? (
            <CircleDot className="text-success size-3.5" aria-hidden="true" />
          ) : isSubstitution ? (
            <ArrowRightLeft className="text-primary size-3.5" aria-hidden="true" />
          ) : isCard ? (
            <span
              className={cn(
                "block h-3.5 w-2.5 rounded-[2px]",
                red ? "bg-destructive" : "bg-warning"
              )}
              aria-hidden="true"
            />
          ) : (
            <Activity className="text-muted-foreground size-3.5" aria-hidden="true" />
          )}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        <span dir="auto" className="mt-0.5 block truncate text-sm">
          {isSubstitution && event.assistName
            ? `${event.playerName ?? ""} → ${event.assistName}`
            : event.playerName ?? team?.shortName ?? ""}
        </span>
        <span dir="auto" className="text-muted-foreground mt-0.5 block text-[0.68rem]">
          {team?.name}
          {isGoal && event.assistName
            ? ` · ${t("assist", { name: event.assistName })}`
            : ""}
        </span>
      </span>
    </li>
  );
}

async function TopPerformers({
  fixture,
  details,
}: {
  fixture: Fixture;
  details: FixtureProviderDetails | null;
}) {
  const t = await getTranslations("matchDetails.performers");
  const players = [...(details?.playerPerformances ?? [])]
    .filter((player) => player.rating !== null)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 4);
  if (players.length === 0) return null;

  return (
    <SectionCard>
      <SectionTitle
        icon={<Star className="size-4" aria-hidden="true" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {players.map((player) => (
          <PerformerRow key={player.id} player={player} fixture={fixture} />
        ))}
      </div>
    </SectionCard>
  );
}

async function PerformerRow({
  player,
  fixture,
}: {
  player: PlayerPerformance;
  fixture: Fixture;
}) {
  const t = await getTranslations("matchDetails.performers");
  const team = player.side === "home" ? fixture.homeTeam : fixture.awayTeam;

  return (
    <article className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <span className="bg-background/50 relative size-11 shrink-0 overflow-hidden rounded-lg border border-white/10">
        {player.photoUrl ? (
          <Image
            src={player.photoUrl}
            alt=""
            fill
            sizes="44px"
            className="object-cover object-top"
          />
        ) : (
          <User className="text-muted-foreground absolute inset-0 m-auto size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold">
          {player.name}
        </span>
        <span dir="auto" className="text-muted-foreground mt-0.5 block truncate text-[0.68rem]">
          {team.shortName}
          {player.goals > 0 ? ` · ${t("goals", { count: player.goals })}` : ""}
          {player.assists > 0
            ? ` · ${t("assists", { count: player.assists })}`
            : ""}
        </span>
      </span>
      <span className="bg-success/10 text-success rounded-lg px-2 py-1 text-sm font-bold tabular-nums">
        {player.rating?.toFixed(1)}
      </span>
    </article>
  );
}

async function VenueCard({ fixture }: { fixture: Fixture }) {
  const t = await getTranslations("matchDetails.venue");
  const venue = fixture.venueDetails;

  return (
    <SectionCard className="overflow-hidden p-0">
      {venue?.imageUrl ? (
        <div className="relative h-36">
          <Image
            src={venue.imageUrl}
            alt={t("imageAlt", { venue: fixture.venue ?? "" })}
            fill
            sizes="(min-width: 1024px) 320px, 100vw"
            className="object-cover"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-[rgb(5_10_28/0.94)] via-[rgb(5_10_28/0.25)] to-transparent" />
          <Building2 className="absolute bottom-3 start-4 size-5 text-white" aria-hidden="true" />
        </div>
      ) : null}
      <div className="p-4">
        <SectionTitle
          icon={
            venue?.imageUrl ? null : (
              <Building2 className="size-4" aria-hidden="true" />
            )
          }
          title={t("title")}
          subtitle={fixture.venue ?? t("unknown")}
        />
        <dl className="mt-4 space-y-3 text-sm">
          {venue?.city ? <DetailLine label={t("city")} value={venue.city} /> : null}
          {venue?.address ? (
            <DetailLine label={t("address")} value={venue.address} />
          ) : null}
          {venue?.capacity ? (
            <DetailLine
              label={t("capacity")}
              value={new Intl.NumberFormat().format(venue.capacity)}
            />
          ) : null}
          {venue?.surface ? (
            <DetailLine
              label={t("surface")}
              value={venue.surface === "grass" ? t("grass") : venue.surface}
            />
          ) : null}
          {fixture.referee ? (
            <DetailLine label={t("referee")} value={fixture.referee} />
          ) : null}
          {fixture.attendance !== null && fixture.attendance !== undefined ? (
            <DetailLine
              label={t("attendance")}
              value={new Intl.NumberFormat().format(fixture.attendance)}
            />
          ) : null}
        </dl>
      </div>
    </SectionCard>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b border-white/[0.07] pb-2 last:border-0 last:pb-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd dir="auto" className="text-end text-xs font-medium">{value}</dd>
    </div>
  );
}

async function ForecastCard({ fixture, locale }: { fixture: Fixture; locale: string }) {
  const t = await getTranslations("matchDetails.forecast");
  const forecast = fixture.forecast;
  if (!forecast || forecast.home === null || forecast.draw === null || forecast.away === null) {
    return null;
  }

  const values = [
    { label: fixture.homeTeam.shortName, value: forecast.home },
    { label: t("draw"), value: forecast.draw },
    { label: fixture.awayTeam.shortName, value: forecast.away },
  ];
  const format = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });

  return (
    <SectionCard>
      <SectionTitle
        icon={<Activity className="size-4" aria-hidden="true" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="mt-4 space-y-3">
        {values.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span dir="auto" className="truncate">{item.label}</span>
              <span data-numeric className="font-semibold tabular-nums">
                {format.format(item.value)}
              </span>
            </div>
            <div className="bg-white/[0.06] mt-1.5 h-1.5 overflow-hidden rounded-full">
              <span
                className="bg-primary block h-full rounded-full"
                style={{ width: `${item.value * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

async function HistoryCard({
  fixture,
  history,
  locale,
}: {
  fixture: Fixture;
  history: FixtureHistory;
  locale: string;
}) {
  const t = await getTranslations("matchDetails.history");

  return (
    <SectionCard>
      <SectionTitle
        icon={<Clock className="size-4" aria-hidden="true" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <div className="mt-5">
        <h3 className="text-xs font-semibold">{t("headToHead")}</h3>
        {history.headToHead.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-xs">{t("noMeetings")}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {history.headToHead.map((past) => (
              <li key={past.id}>
                <Link
                  href={`/matches/${past.id}`}
                  className="ease-snap flex items-center gap-2 rounded-lg border border-white/[0.08] px-2.5 py-2 text-xs transition-transform duration-150 active:scale-[0.98]"
                >
                  <span className="text-muted-foreground shrink-0 text-[0.65rem]">
                    {new Intl.DateTimeFormat(locale, {
                      day: "2-digit",
                      month: "short",
                    }).format(new Date(past.kickoffAt))}
                  </span>
                  <span dir="auto" className="min-w-0 flex-1 truncate">
                    {past.homeTeam.shortName} – {past.awayTeam.shortName}
                  </span>
                  <span dir="ltr" data-numeric className="font-bold">
                    {past.homeGoals}:{past.awayGoals}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <h3 className="text-xs font-semibold">{t("recentForm")}</h3>
        <div className="mt-3 space-y-3">
          <FormRow team={fixture.homeTeam} fixtures={history.homeRecent} />
          <FormRow team={fixture.awayTeam} fixtures={history.awayRecent} />
        </div>
        <p className="text-muted-foreground mt-4 text-[0.65rem] leading-relaxed">
          {t("competitionOnly")}
        </p>
      </div>
    </SectionCard>
  );
}

async function FormRow({ team, fixtures }: { team: Team; fixtures: Fixture[] }) {
  const t = await getTranslations("matchDetails.history");
  return (
    <div className="flex items-center gap-2">
      <TeamCrest team={team} className="size-7" />
      <span dir="auto" className="min-w-0 flex-1 truncate text-xs font-medium">
        {team.shortName}
      </span>
      <span className="flex gap-1" aria-label={t("formFor", { team: team.name })}>
        {fixtures.length === 0 ? (
          <span className="text-muted-foreground text-xs">—</span>
        ) : (
          fixtures
            .slice()
            .reverse()
            .map((fixture) => {
              const outcome = outcomeForTeam(fixture, team.id);
              return (
                <span
                  key={fixture.id}
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[0.6rem] font-bold",
                    outcome === "win" && "bg-success/15 text-success",
                    outcome === "draw" && "bg-warning/15 text-warning",
                    outcome === "loss" && "bg-destructive/15 text-destructive"
                  )}
                  title={t(outcome)}
                >
                  {t(`${outcome}Short`)}
                </span>
              );
            })
        )}
      </span>
    </div>
  );
}

function outcomeForTeam(
  fixture: Fixture,
  teamId: string
): "win" | "draw" | "loss" {
  if (fixture.homeGoals === fixture.awayGoals) return "draw";
  const homeWon = (fixture.homeGoals ?? 0) > (fixture.awayGoals ?? 0);
  const teamWasHome = fixture.homeTeam.id === teamId;
  return homeWon === teamWasHome ? "win" : "loss";
}

function SectionCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-card/55 rounded-2xl border border-white/15 p-4 shadow-[0_12px_36px_rgb(3_7_25/0.2)] backdrop-blur-xl sm:p-5",
        className
      )}
    >
      {children}
    </section>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon ? (
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground mt-5 rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-balance">
      {children}
    </p>
  );
}
