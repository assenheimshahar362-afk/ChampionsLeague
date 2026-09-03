import { Banknote, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { GroupImage } from "@/components/groups/group-image";
import { AutoJoinGroup } from "@/components/groups/auto-join-group";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { getGroupInvite } from "@/lib/groups/queries";
import { getUser } from "@/lib/supabase/server";

type GroupInvitePageProps = {
  params: Promise<{ locale: string; inviteCode: string }>;
};

export async function generateMetadata(
  { params }: GroupInvitePageProps
): Promise<Metadata> {
  const { locale, inviteCode } = await params;
  const group = await getGroupInvite(inviteCode);
  if (!group) return {};

  const t = await getTranslations({ locale, namespace: "groupInvite" });
  const fee = group.entryFeeAgorot === 0
    ? t("free")
    : formatInviteFee(group.entryFeeAgorot, locale);
  const title = t("shareTitle", { group: group.name });
  const description = t("shareDescription", { group: group.name, fee });
  const image = {
    url: "/alufot-og.jpg",
    width: 1200,
    height: 630,
    alt: "Alufot — Champions League predictions",
  };

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/${locale}/g/${inviteCode}`,
      siteName: "Alufot",
      locale: locale === "he" ? "he_IL" : "en_GB",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function GroupInvitePage({ params }: GroupInvitePageProps) {
  const { locale, inviteCode } = await params;
  if (isLocale(locale)) setRequestLocale(locale);
  const user = await getUser();

  const group = await getGroupInvite(inviteCode, user?.id);
  if (!group) notFound();
  const t = await getTranslations("groupInvite");
  const fee = formatInviteFee(group.entryFeeAgorot, locale);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-start px-4 pb-16 pt-8 sm:pt-12">
      <article className="w-full overflow-hidden rounded-3xl border border-white/15 bg-card/60 shadow-[0_28px_90px_rgb(2_7_28/0.35),inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-xl">
        <header className="from-primary/20 via-primary/[0.06] relative isolate overflow-hidden border-b border-white/10 bg-gradient-to-br to-transparent px-5 py-7 text-center sm:px-7">
          <span className="bg-primary/20 absolute -end-12 -top-16 -z-10 size-44 rounded-full blur-3xl" />
          <GroupImage
            imageUrl={group.imageUrl}
            name={group.name}
            className="mx-auto size-24 rounded-3xl"
            sizes="96px"
          />
          <p className="text-primary mt-4 text-xs font-semibold tracking-[0.16em] uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {group.name}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm text-pretty">
            {t("subtitle")}
          </p>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.035]">
            <InviteStat
              icon={<Users aria-hidden="true" />}
              label={t("members")}
              value={t("memberCount", { count: group.memberCount })}
            />
            <InviteStat
              icon={<Banknote aria-hidden="true" />}
              label={t("entryFee")}
              value={group.entryFeeAgorot === 0 ? t("free") : fee}
            />
          </dl>

          {!user ? (
            <Button asChild className="w-full" size="lg">
              <Link href={`/sign-in?next=${encodeURIComponent(`/${locale}/g/${inviteCode}`)}`}>
                {t("signInToJoin")}
              </Link>
            </Button>
          ) : group.membership === "member" ? (
            <div className="space-y-3 text-center">
              <p className="text-success text-sm font-medium">{t("alreadyMember")}</p>
              <Button asChild className="w-full" size="lg">
                <Link href="/profile#groups">{t("openGroup")}</Link>
              </Button>
            </div>
          ) : (
            <AutoJoinGroup inviteCode={group.inviteCode} />
          )}
        </div>
      </article>
    </main>
  );
}

function formatInviteFee(agorot: number, locale: string): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(agorot / 100);
}

function InviteStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border-e border-foreground/10 px-3 py-3 text-center last:border-e-0">
      <span className="text-primary mx-auto flex size-7 items-center justify-center [&_svg]:size-4">
        {icon}
      </span>
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
    </div>
  );
}
