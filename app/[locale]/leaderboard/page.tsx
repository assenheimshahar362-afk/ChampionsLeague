import { Banknote, LockKeyhole, Trophy, UserRound, Users } from "lucide-react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { SchemaNotReadyError } from "@/lib/fixtures/queries";
import {
  getLeaderboard,
  type LeaderboardGroup,
  type LeaderboardRow,
  type LeaderboardView,
} from "@/lib/leaderboard/queries";
import { getUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * The players table. Season picks come through a SECURITY INVOKER RPC, so RLS
 * decides whether each image reaches this component at all.
 */
export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);

  const t = await getTranslations("leaderboard");
  const user = await getUser();

  let leaderboard: LeaderboardView = {
    groups: [],
    selectedGroup: null,
    rows: [],
    currentSeason: null,
    picksRevealed: false,
  };
  if (user) {
    try {
      leaderboard = await getLeaderboard(user.id, (await searchParams).group);
    } catch (error) {
      if (!(error instanceof SchemaNotReadyError)) throw error;
      return <SetupNotice reason="schema" />;
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16">
      <PageHeader
        className="mt-8"
        title={t("title")}
        description={
          leaderboard.selectedGroup
            ? t("groupSubtitle", { group: leaderboard.selectedGroup.name })
            : t("subtitle")
        }
      />

      {!user ? (
        <div className="mt-8 rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-muted-foreground text-sm text-balance">
            {t("signedOut")}
          </p>
          <Button asChild size="lg" className="mt-4">
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {leaderboard.groups.length > 0 ? (
            <GroupScopeNav
              groups={leaderboard.groups}
              selectedGroupId={leaderboard.selectedGroup?.id ?? null}
            />
          ) : null}

          {leaderboard.selectedGroup ? (
            <div className="bg-card/55 mt-2.5 flex items-center gap-3 rounded-xl border border-white/15 px-3.5 py-3 backdrop-blur-xl">
              <span className="bg-warning/10 text-warning flex size-9 shrink-0 items-center justify-center rounded-lg border border-warning/15">
                <Banknote className="size-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {t("groupPotTitle", {
                    group: leaderboard.selectedGroup.name,
                  })}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {t("groupPotCalculation", {
                    members: leaderboard.selectedGroup.memberCount,
                    entryFee: formatAgorot(
                      leaderboard.selectedGroup.entryFeeAgorot,
                      locale
                    ),
                  })}
                </span>
              </span>
              <strong
                data-numeric
                className="text-warning shrink-0 text-lg font-bold tabular-nums"
              >
                {formatAgorot(leaderboard.selectedGroup.potAgorot, locale)}
              </strong>
            </div>
          ) : null}

          {leaderboard.rows.length === 0 ? (
            <p className="text-muted-foreground mt-8 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-balance">
              {t("empty")}
            </p>
          ) : (
            <div className="bg-card/55 mt-5 overflow-hidden rounded-2xl border border-white/15 shadow-[0_18px_54px_rgb(3_7_25/0.24)] backdrop-blur-xl">
              <table className="w-full table-fixed">
                <caption className="sr-only">{t("title")}</caption>
                <colgroup>
                  <col />
                  <col className="w-14 sm:w-20" />
                  <col className="w-14 sm:w-20" />
                  <col className="w-14 sm:w-20" />
                </colgroup>
                <thead className="border-primary/20 bg-primary/[0.08] border-b">
                  <tr className="text-muted-foreground text-[0.65rem] font-semibold sm:text-xs">
                    <th scope="col" className="px-3 py-3 text-start">
                      {t("participant")}
                    </th>
                    <th scope="col" className="px-1 py-3 text-center">
                      {t("championPick")}
                    </th>
                    <th scope="col" className="px-1 py-3 text-center">
                      {t("scorerPick")}
                    </th>
                    <th scope="col" className="px-2 py-3 text-center">
                      {t("points")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {leaderboard.rows.map((row) => (
                    <LeaderboardTableRow
                      key={row.userId}
                      row={row}
                      isMe={row.userId === user.id}
                      locale={locale}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

async function GroupScopeNav({
  groups,
  selectedGroupId,
}: {
  groups: LeaderboardGroup[];
  selectedGroupId: string | null;
}) {
  const t = await getTranslations("leaderboard");

  return (
    <nav
      aria-label={t("scopeLabel")}
      className="bg-card/55 mt-5 overflow-x-auto rounded-xl border border-white/15 p-1.5 backdrop-blur-xl"
    >
      <div className="flex min-w-max gap-1">
        <Button
          asChild
          size="sm"
          variant={selectedGroupId === null ? "secondary" : "ghost"}
        >
          <Link
            href="/leaderboard"
            aria-current={selectedGroupId === null ? "page" : undefined}
          >
            <Users className="size-3.5" aria-hidden="true" />
            {t("globalTable")}
          </Link>
        </Button>

        {groups.map((group) => {
          const active = group.id === selectedGroupId;
          return (
            <Button
              key={group.id}
              asChild
              size="sm"
              variant={active ? "secondary" : "ghost"}
            >
              <Link
                href={{ pathname: "/leaderboard", query: { group: group.id } }}
                aria-current={active ? "page" : undefined}
              >
                {group.name}
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}

function formatAgorot(agorot: number, locale: string): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(agorot / 100);
}

async function LeaderboardTableRow({
  row,
  isMe,
  locale,
}: {
  row: LeaderboardRow;
  isMe: boolean;
  locale: string;
}) {
  const t = await getTranslations("leaderboard");

  return (
    <tr
      className={cn(
        "transition-colors duration-150",
        // Your own row stays easy to find without overpowering the picks.
        isMe && "bg-primary/[0.09]"
      )}
    >
      <td className="min-w-0 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="flex w-5 shrink-0 justify-center sm:w-6">
            <span
              data-numeric
              className="text-muted-foreground text-xs font-semibold sm:text-sm"
            >
              {row.rank}
            </span>
          </span>

          <span className="relative size-9 shrink-0 overflow-hidden rounded-full border border-white/15 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] sm:size-10">
            <ProfileAvatar
              avatarUrl={row.avatarUrl}
              seed={row.userId}
              alt=""
              sizes="40px"
            />
          </span>

          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-start text-sm font-semibold sm:text-base"
            >
              <bdi>{row.displayName}</bdi>
              {isMe ? (
                <span className="text-primary ms-1 text-[0.65rem] font-medium sm:ms-1.5 sm:text-xs">
                  {t("you")}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground mt-0.5 hidden truncate text-[0.65rem] min-[390px]:block sm:text-xs">
              {t("record", {
                exact: row.exact,
                correct: row.correct,
                settled: row.settled,
              })}
            </span>
          </span>
        </div>
      </td>

      <td className="px-1 py-2 text-center">
        <SeasonPickCell row={row} kind="champion" locale={locale} />
      </td>

      <td className="px-1 py-2 text-center">
        <SeasonPickCell row={row} kind="scorer" locale={locale} />
      </td>

      <td className="px-2 py-2 text-center sm:px-3">
        <span
          data-numeric
          className="block text-base leading-none font-bold tabular-nums sm:text-lg"
        >
          {row.points}
        </span>
        {row.seasonBonus > 0 ? (
          <span className="text-warning mt-1 inline-flex items-center gap-0.5 text-[0.6rem] font-medium sm:text-[0.68rem]">
            <Trophy className="size-2.5" aria-hidden="true" />
            +{row.seasonBonus}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

async function SeasonPickCell({
  row,
  kind,
  locale,
}: {
  row: LeaderboardRow;
  kind: "champion" | "scorer";
  locale: string;
}) {
  const t = await getTranslations("leaderboard");

  if (row.seasonPickState === "hidden") {
    return (
      <span
        title={t("pickHidden")}
        className="bg-muted/70 text-muted-foreground mx-auto flex size-9 items-center justify-center rounded-full border border-white/10 sm:size-10"
      >
        <LockKeyhole className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{t("pickHidden")}</span>
      </span>
    );
  }

  const pick = row.seasonPick;
  if (!pick || row.seasonPickState === "missing") {
    return (
      <span className="text-muted-foreground" aria-label={t("pickMissing")}>
        —
      </span>
    );
  }

  const champion = kind === "champion";
  const name = champion
    ? locale === "he"
      ? pick.championNameHe
      : pick.championNameEn
    : locale === "he"
      ? pick.scorerNameHe
      : pick.scorerNameEn;
  const imageUrl = champion ? pick.championLogoUrl : pick.scorerPhotoUrl;

  return (
    <span
      title={name}
      className="bg-muted relative mx-auto flex size-9 items-center justify-center overflow-hidden rounded-full border border-white/15 shadow-[0_5px_14px_rgb(0_0_0/0.24)] sm:size-10"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes="40px"
          className={champion ? "object-contain p-1" : "object-cover object-top"}
          unoptimized
        />
      ) : champion ? (
        <Trophy className="text-muted-foreground size-4" aria-hidden="true" />
      ) : (
        <UserRound className="text-muted-foreground size-4" aria-hidden="true" />
      )}
      {!imageUrl ? <span className="sr-only">{name}</span> : null}
    </span>
  );
}
