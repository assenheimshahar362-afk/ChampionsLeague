import {
  Activity,
  CalendarClock,
  Database,
  Gauge,
  Settings2,
  ShieldCheck,
  Trophy,
  UserRoundCog,
  Users,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import {
  ConfirmActionButton,
  ConfirmDeleteButton,
} from "@/components/admin/confirm-submit";
import { GroupPaymentForm } from "@/components/groups/group-forms";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import {
  adminAddGroupMember,
  adminChangeGroupMemberRole,
  adminCreateGroup,
  adminDeleteGroup,
  adminDeleteUser,
  adminRemoveGroupMember,
  adminRenameGroup,
  adminResetAvatar,
  adminRunSettlement,
  adminUpdateCandidatePoints,
  adminUpdateFixtureKickoff,
  adminUpdateGameSettings,
  adminUpdateNickname,
} from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminOverview } from "@/lib/admin/queries";
import { cn } from "@/lib/utils";

type AdminData = Awaited<ReturnType<typeof getAdminOverview>>;
type View =
  | "overview"
  | "users"
  | "groups"
  | "fixtures"
  | "rules"
  | "operations";

const VIEWS: View[] = [
  "overview",
  "users",
  "groups",
  "fixtures",
  "rules",
  "operations",
];

const selectClass =
  "h-8 rounded-lg border border-white/20 bg-background/45 px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);
  const admin = await requireAdmin(locale);
  const requested = (await searchParams).view;
  const view: View = VIEWS.includes(requested as View)
    ? (requested as View)
    : "overview";
  const [t, data] = await Promise.all([
    getTranslations("admin"),
    getAdminOverview(),
  ]);

  const navItems = [
    ["overview", Gauge, t("overview")],
    ["users", Users, t("users")],
    ["groups", UserRoundCog, t("groups")],
    ["fixtures", CalendarClock, t("fixtures")],
    ["rules", Trophy, t("rules")],
    ["operations", Database, t("operations")],
  ] as const;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20">
      <PageHeader
        className="mt-8"
        eyebrow={
          <>
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t("eyebrow")}
          </>
        }
        title={t("title")}
        description={t("subtitle")}
      />

      <section className="bg-card/50 mt-6 overflow-hidden rounded-[2rem] border border-white/15 shadow-[0_24px_70px_rgb(3_7_25/0.2)] backdrop-blur-2xl">
        <nav
          className="overflow-x-auto border-b border-white/10 px-2 py-2 sm:px-4"
          aria-label={t("views")}
        >
          <div className="flex min-w-max gap-1">
            {navItems.map(([key, Icon, label]) => (
              <Button
                key={key}
                asChild
                variant="ghost"
                className={cn(
                  "h-9 px-3",
                  view === key &&
                    "border-primary/25 bg-primary/10 text-primary shadow-sm"
                )}
              >
                <Link href={{ pathname: "/admin", query: { view: key } }}>
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              </Button>
            ))}
          </div>
        </nav>

        <div className="px-4 pb-6 sm:px-6 sm:pb-8">
          {view === "overview" ? <Overview data={data} locale={locale} /> : null}
          {view === "users" ? (
            <Participants data={data} adminId={admin.id} locale={locale} />
          ) : null}
          {view === "groups" ? <Groups data={data} /> : null}
          {view === "fixtures" ? <Fixtures data={data} locale={locale} /> : null}
          {view === "rules" ? <RulesAndScoring data={data} locale={locale} /> : null}
          {view === "operations" ? (
            <Operations data={data} locale={locale} />
          ) : null}
        </div>
      </section>
    </main>
  );
}

async function Overview({ data, locale }: { data: AdminData; locale: string }) {
  const t = await getTranslations("admin");
  const onboarding = data.metrics.users - data.metrics.activeUsers;

  return (
    <div className="mt-6 space-y-8">
      <section className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-white/10 py-5 lg:grid-cols-6">
        <Metric icon={<Users />} label={t("metrics.users")} value={data.metrics.users} />
        <Metric icon={<UserRoundCog />} label={t("metrics.groups")} value={data.metrics.groups} />
        <Metric icon={<Activity />} label={t("metrics.predictions")} value={data.metrics.predictions} />
        <Metric icon={<CalendarClock />} label={t("metrics.fixtures")} value={data.metrics.fixtures} />
        <Metric icon={<Trophy />} label={t("metrics.points")} value={data.metrics.pointsAwarded} />
        <Metric icon={<Database />} label={t("metrics.pending")} value={data.metrics.pendingResults} />
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <AdminPanel title={t("attention.title")} icon={<Activity />}>
          <div className="space-y-2.5">
            <HealthRow
              label={t("attention.onboarding")}
              value={onboarding}
              warning={onboarding > 0}
            />
            <HealthRow
              label={t("attention.pendingResults")}
              value={data.metrics.pendingResults}
              warning={data.metrics.pendingResults > 0}
            />
            <HealthRow
              label={t("attention.scoringRules")}
              value={t("attention.perFixtureScoring")}
            />
          </div>
        </AdminPanel>

        <AdminPanel title={t("recentUsers")} icon={<Users />}>
          <div className="space-y-3">
            {[...data.users]
              .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
              .slice(0, 5)
              .map((user) => (
                <div key={user.id} className="flex items-center gap-3">
                  <span className="relative size-9 shrink-0 overflow-hidden rounded-xl border border-white/15">
                    <ProfileAvatar
                      avatarUrl={user.avatarUrl}
                      seed={user.id}
                      alt=""
                      sizes="36px"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {user.nickname}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {formatDate(locale, user.createdAt)}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </AdminPanel>
      </section>
    </div>
  );
}

async function Participants({
  data,
  adminId,
  locale,
}: {
  data: AdminData;
  adminId: string;
  locale: string;
}) {
  const t = await getTranslations("admin");

  return (
    <section className="mt-6 space-y-3" aria-labelledby="participants-heading">
      <SectionIntro
        id="participants-heading"
        title={t("participants.title")}
        body={t("participants.body")}
      />
      {data.users.map((user) => (
        <article
          key={user.id}
          className="border-b border-white/10 py-4 last:border-b-0"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-white/15">
                <ProfileAvatar
                  avatarUrl={user.avatarUrl}
                  seed={user.id}
                  alt=""
                  sizes="44px"
                />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{user.nickname}</h3>
                  <StatusChip
                    active={user.nicknameConfirmed}
                    activeLabel={t("participants.active")}
                    inactiveLabel={t("participants.onboarding")}
                  />
                </div>
                <p dir="ltr" className="text-muted-foreground truncate text-xs">
                  {user.email}
                </p>
                <p className="text-muted-foreground mt-1 text-[0.7rem]">
                  {t("participants.meta", {
                    groups: user.groupCount,
                    predictions: user.predictionCount,
                    points: user.points,
                  })}
                </p>
                <p className="text-muted-foreground/70 mt-0.5 text-[0.68rem]">
                  {t("participants.joined", {
                    date: formatDate(locale, user.createdAt),
                  })}
                </p>
              </div>
            </div>

            <form action={adminUpdateNickname} className="flex min-w-0 gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <Input
                name="nickname"
                defaultValue={user.nickname}
                minLength={2}
                maxLength={30}
                required
                aria-label={`${t("participants.nickname")}: ${user.nickname}`}
              />
              <Button type="submit" size="sm">
                {t("save")}
              </Button>
            </form>

            <div className="flex items-center justify-end gap-1">
              {user.avatarUrl ? (
                <form action={adminResetAvatar}>
                  <input type="hidden" name="userId" value={user.id} />
                  <ConfirmActionButton
                    label={t("participants.resetAvatar")}
                    confirmation={t("participants.confirmResetAvatar")}
                  />
                </form>
              ) : null}
              <form action={adminDeleteUser}>
                <input type="hidden" name="userId" value={user.id} />
                <ConfirmDeleteButton disabled={user.id === adminId} />
              </form>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

async function Groups({ data }: { data: AdminData }) {
  const t = await getTranslations("admin");

  return (
    <section className="mt-6 space-y-4" aria-labelledby="groups-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionIntro
          id="groups-heading"
          title={t("groupAdmin.title")}
          body={t("groupAdmin.body")}
        />
        <form action={adminCreateGroup} className="flex w-full gap-2 sm:w-auto">
          <Input
            name="name"
            minLength={2}
            maxLength={60}
            required
            aria-label={t("groupAdmin.name")}
            placeholder={t("groupAdmin.newPlaceholder")}
            className="sm:w-64"
          />
          <Button type="submit">{t("groupAdmin.create")}</Button>
        </form>
      </div>

      {data.groups.map((group) => {
        const memberIds = new Set(group.members.map((member) => member.userId));
        const availableUsers = data.users.filter((user) => !memberIds.has(user.id));

        return (
          <details
            key={group.id}
            className="group border-b border-white/10 last:border-b-0"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 py-4 select-none">
              <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl border border-primary/15">
                <Users className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{group.name}</span>
                <span className="text-muted-foreground block text-xs">
                  {t("groupAdmin.meta", {
                    members: group.memberCount,
                    creator: group.creatorName,
                  })}
                </span>
              </span>
              <span className="text-muted-foreground text-xs group-open:hidden">
                {t("groupAdmin.open")}
              </span>
            </summary>

            <div className="border-t border-white/10 py-4">
              <div className="flex flex-wrap gap-2">
                <form action={adminRenameGroup} className="flex min-w-64 flex-1 gap-2">
                  <input type="hidden" name="groupId" value={group.id} />
                  <Input
                    name="name"
                    defaultValue={group.name}
                    minLength={2}
                    maxLength={60}
                    required
                    aria-label={`${t("groupAdmin.name")}: ${group.name}`}
                  />
                  <Button type="submit" size="sm">{t("save")}</Button>
                </form>
                <form action={adminDeleteGroup}>
                  <input type="hidden" name="groupId" value={group.id} />
                  <ConfirmDeleteButton />
                </form>
              </div>

              <GroupPaymentForm
                key={`${group.id}-${group.entryFeeAgorot}-${group.payment.bitUrl}-${group.payment.payboxUrl}-${group.payment.note}`}
                groupId={group.id}
                entryFeeAgorot={group.entryFeeAgorot}
                payment={group.payment}
              />

              <div className="mt-4 space-y-2">
                {group.members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex flex-wrap items-center gap-3 border-b border-white/10 py-2.5 last:border-b-0"
                  >
                    <span className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-white/15">
                      <ProfileAvatar
                        avatarUrl={member.avatarUrl}
                        seed={member.userId}
                        alt=""
                        sizes="32px"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{member.nickname}</span>
                      <span dir="ltr" className="text-muted-foreground block truncate text-xs">{member.email}</span>
                    </span>
                    <form action={adminChangeGroupMemberRole} className="flex gap-2">
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="userId" value={member.userId} />
                      <select
                        name="role"
                        defaultValue={member.role}
                        aria-label={`${t("groupAdmin.role")}: ${member.nickname}`}
                        className={selectClass}
                      >
                        <option value="member">{t("groupAdmin.member")}</option>
                        <option value="manager">{t("groupAdmin.manager")}</option>
                      </select>
                      <Button type="submit" size="sm">{t("save")}</Button>
                    </form>
                    <form action={adminRemoveGroupMember}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="userId" value={member.userId} />
                      <ConfirmActionButton
                        label={t("groupAdmin.remove")}
                        confirmation={t("groupAdmin.confirmRemove")}
                        destructive
                      />
                    </form>
                  </div>
                ))}
              </div>

              {availableUsers.length > 0 ? (
                <form
                  action={adminAddGroupMember}
                  className="mt-4 flex flex-wrap items-end gap-2 border-t border-white/10 pt-4"
                >
                  <input type="hidden" name="groupId" value={group.id} />
                  <label className="min-w-56 flex-1 text-xs">
                    <span className="text-muted-foreground mb-1 block">{t("groupAdmin.addUser")}</span>
                    <select name="userId" className={cn(selectClass, "w-full")} required>
                      {availableUsers.map((user) => (
                        <option key={user.id} value={user.id}>{user.nickname} · {user.email}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground mb-1 block">{t("groupAdmin.role")}</span>
                    <select name="role" defaultValue="member" className={selectClass}>
                      <option value="member">{t("groupAdmin.member")}</option>
                      <option value="manager">{t("groupAdmin.manager")}</option>
                    </select>
                  </label>
                  <Button type="submit">{t("groupAdmin.add")}</Button>
                </form>
              ) : null}
            </div>
          </details>
        );
      })}
    </section>
  );
}

async function Fixtures({ data, locale }: { data: AdminData; locale: string }) {
  const t = await getTranslations("admin");

  return (
    <section className="mt-6" aria-labelledby="fixtures-heading">
      <SectionIntro
        id="fixtures-heading"
        title={t("fixtureAdmin.title")}
        body={t("fixtureAdmin.body")}
      />
      <div className="mt-4 max-h-[62rem] overflow-y-auto border-t border-white/10">
        {data.fixtures.map((fixture) => (
          <form
            key={fixture.id}
            action={adminUpdateFixtureKickoff}
            className="grid gap-3 border-b border-white/10 p-3 last:border-0 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-center"
          >
            <input type="hidden" name="fixtureId" value={fixture.id} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" dir="auto">
                {fixture.homeTeam} <span className="text-muted-foreground px-1">–</span> {fixture.awayTeam}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {fixture.round} · {formatDateTime(locale, fixture.kickoff_at)}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <SmallChip>{t(`fixtureStatus.${fixture.status}`)}</SmallChip>
                <SmallChip>{t(`resultState.${fixture.resultState}`)}</SmallChip>
                {fixture.home_goals !== null ? (
                  <SmallChip>{fixture.home_goals}–{fixture.away_goals}</SmallChip>
                ) : null}
              </div>
            </div>
            <Input
              name="kickoffAt"
              defaultValue={fixture.kickoff_at}
              required
              dir="ltr"
              aria-label={t("fixtureAdmin.kickoff")}
            />
            <Button type="submit" size="sm">{t("fixtureAdmin.update")}</Button>
          </form>
        ))}
      </div>
    </section>
  );
}

async function RulesAndScoring({ data, locale }: { data: AdminData; locale: string }) {
  const t = await getTranslations("admin");

  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="rules-heading">
        <SectionIntro
          id="rules-heading"
          title={t("rulesAdmin.title")}
          body={t("rulesAdmin.body")}
        />
        <form
          action={adminUpdateGameSettings}
          className="mt-4"
        >
          <input type="hidden" name="exactPoints" value={data.settings.exactPoints} />
          <input type="hidden" name="outcomePoints" value={data.settings.outcomePoints} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium sm:col-span-2">
              {t("rulesAdmin.noteHe")}
              <textarea name="rulesNoteHe" maxLength={2000} defaultValue={data.settings.rulesNoteHe} dir="rtl" className="bg-background/45 focus-visible:border-ring focus-visible:ring-ring/50 mt-1.5 min-h-28 w-full rounded-xl border border-white/20 p-3 text-sm outline-none focus-visible:ring-3" />
            </label>
            <label className="text-xs font-medium sm:col-span-2">
              {t("rulesAdmin.noteEn")}
              <textarea name="rulesNoteEn" maxLength={2000} defaultValue={data.settings.rulesNoteEn} dir="ltr" className="bg-background/45 focus-visible:border-ring focus-visible:ring-ring/50 mt-1.5 min-h-28 w-full rounded-xl border border-white/20 p-3 text-sm outline-none focus-visible:ring-3" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-muted-foreground text-xs">
              {t("rulesAdmin.updated", { date: formatDateTime(locale, data.settings.updatedAt) })}
            </p>
            <ConfirmActionButton
              label={t("rulesAdmin.save")}
              confirmation={t("rulesAdmin.confirm")}
            />
          </div>
        </form>
      </section>

      <section>
        <SectionIntro title={t("candidateAdmin.title")} body={t("candidateAdmin.body")} />
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <CandidateList title={t("championPoints")} saveLabel={t("save")} kind="team" candidates={data.teamCandidates.map((row) => ({ id: row.candidate_id, season: row.season, name: row.name, points: row.pick_points }))} />
          <CandidateList title={t("scorerPoints")} saveLabel={t("save")} kind="player" candidates={data.playerCandidates.map((row) => ({ id: row.candidate_id, season: row.season, name: row.name_en, points: row.pick_points }))} />
        </div>
      </section>
    </div>
  );
}

async function Operations({ data, locale }: { data: AdminData; locale: string }) {
  const t = await getTranslations("admin");

  return (
    <div className="mt-6 space-y-8">
      <section className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-white/10 py-5 lg:grid-cols-6">
        <OperationCard label={t("operationsAdmin.season")} value={data.operations.season} />
        <OperationCard label={t("operationsAdmin.rebase")} value={data.operations.rebaseEnabled ? t("enabled") : t("disabled")} />
        <OperationCard label={t("operationsAdmin.scale")} value={data.operations.rebaseScale} />
        <OperationCard label={t("operationsAdmin.scheduled")} value={data.operations.scheduledFixtures} />
        <OperationCard label={t("operationsAdmin.finished")} value={data.operations.finishedFixtures} />
        <OperationCard label={t("operationsAdmin.lastUpdate")} value={formatDateTime(locale, data.operations.latestFixtureUpdate)} />
      </section>

      <AdminPanel title={t("operationsAdmin.settlementTitle")} icon={<Settings2 />}>
        <p className="text-muted-foreground text-sm text-pretty">{t("operationsAdmin.settlementBody")}</p>
        <form action={adminRunSettlement} className="mt-4">
          <ConfirmActionButton
            label={t("operationsAdmin.runSettlement")}
            confirmation={t("operationsAdmin.confirmSettlement")}
          />
        </form>
      </AdminPanel>

      <AdminPanel title={t("operationsAdmin.securityTitle")} icon={<ShieldCheck />}>
        <ul className="text-muted-foreground space-y-2 text-sm">
          <li>{t("operationsAdmin.securityAuth")}</li>
          <li>{t("operationsAdmin.securityServer")}</li>
          <li>{t("operationsAdmin.securityRls")}</li>
        </ul>
      </AdminPanel>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <article className="min-w-0">
      <span className="text-primary [&_svg]:size-4">{icon}</span>
      <p data-numeric className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </article>
  );
}

function AdminPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary [&_svg]:size-4">{icon}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function HealthRow({ label, value, warning = false }: { label: string; value: ReactNode; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 py-2.5 last:border-b-0">
      <span className="text-sm">{label}</span>
      <span className={warning ? "text-warning text-sm font-semibold" : "text-success text-sm font-semibold"}>{value}</span>
    </div>
  );
}

function StatusChip({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span className={active ? "bg-success/15 text-success rounded-full px-2 py-0.5 text-[0.65rem] font-medium" : "bg-warning/15 text-warning rounded-full px-2 py-0.5 text-[0.65rem] font-medium"}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function SmallChip({ children }: { children: ReactNode }) {
  return <span className="bg-muted/60 text-muted-foreground rounded-full px-2 py-0.5 text-[0.65rem]">{children}</span>;
}

function SectionIntro({ id, title, body }: { id?: string; title: string; body: string }) {
  return (
    <div>
      <h2 id={id} className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">{body}</p>
    </div>
  );
}

function OperationCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p data-numeric className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function CandidateList({ title, saveLabel, kind, candidates }: { title: string; saveLabel: string; kind: "team" | "player"; candidates: Array<{ id: string | number; season: number; name: string; points: number }> }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 max-h-[36rem] overflow-y-auto border-t border-white/10">
        {candidates.map((candidate) => (
          <form key={`${candidate.season}-${candidate.id}`} action={adminUpdateCandidatePoints} className="flex items-center gap-2 border-b border-white/10 p-2.5 last:border-0">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="season" value={candidate.season} />
            <input type="hidden" name="candidateId" value={candidate.id} />
            <span className="min-w-0 flex-1 truncate text-sm">{candidate.name}</span>
            <Input
              data-numeric
              name="points"
              type="number"
              min={1}
              max={200}
              defaultValue={candidate.points}
              aria-label={`${title}: ${candidate.name}`}
              className="w-20"
            />
            <Button type="submit" size="sm">{saveLabel}</Button>
          </form>
        ))}
      </div>
    </section>
  );
}

function formatDate(locale: string, value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(locale: string, value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
