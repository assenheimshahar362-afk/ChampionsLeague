import Image from "next/image";
import {
  Banknote,
  Check,
  Clock3,
  ExternalLink,
  Mail,
  Shield,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import {
  CreateGroupForm,
  EditGroupForm,
  GroupPaymentForm,
} from "@/components/groups/group-forms";
import { GroupImage } from "@/components/groups/group-image";
import { WhatsAppInviteButton } from "@/components/groups/whatsapp-invite-button";
import { Button } from "@/components/ui/button";
import {
  approveGroupJoinRequest,
  changeGroupMemberRole,
  declineGroupJoinRequest,
  deleteManagedGroup,
  removeGroupMember,
} from "@/lib/groups/actions";
import {
  hasConfiguredGroupPayment,
  type GroupPaymentSettings,
} from "@/lib/groups/payment";
import type { GroupView } from "@/lib/groups/queries";

export async function ProfileGroupsSection({
  groups,
  userId,
}: {
  groups: GroupView[];
  userId: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("groups"), getLocale()]);

  return (
    <section id="groups" className="scroll-mt-20">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15">
          <Users className="size-4.5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-muted-foreground mt-0.5 text-sm text-pretty">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="from-primary/[0.08] to-foreground/[0.025] mt-4 rounded-2xl border border-primary/15 bg-gradient-to-br p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">{t("newGroup")}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
            {t("newGroupHint")}
          </p>
        </div>
        <CreateGroupForm />
      </div>

      {groups.length === 0 ? (
        <p className="text-muted-foreground mt-4 rounded-xl border border-dashed border-foreground/15 bg-white/[0.035] px-4 py-6 text-center text-sm">
          {t("empty")}
        </p>
      ) : (
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
          {groups.map((group) => {
            const manager = group.myRole === "manager";
            const fee = formatFee(group.entryFeeAgorot, locale);
            return (
              <article
                key={group.id}
                className="overflow-hidden rounded-2xl border border-foreground/10 bg-white/[0.045] shadow-[0_16px_44px_rgb(3_7_25/0.12)]"
              >
                <header className="from-primary/[0.09] border-b border-foreground/10 bg-gradient-to-br to-transparent p-4">
                  <div className="flex items-start gap-3">
                    <GroupImage
                      imageUrl={group.imageUrl}
                      name={group.name}
                      className="size-16"
                      sizes="64px"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-lg font-semibold tracking-tight">
                        {group.name}
                      </h3>
                      <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="flex items-center gap-1.5">
                          <Users className="size-3.5" aria-hidden="true" />
                          {t("memberCount", { count: group.members.length })}
                        </span>
                        <span className="text-primary flex items-center gap-1.5 font-medium">
                          <Banknote className="size-3.5" aria-hidden="true" />
                          {group.entryFeeAgorot === 0
                            ? t("freeEntry")
                            : t("entryFeeValue", { fee })}
                        </span>
                      </div>
                    </div>
                    {manager ? (
                      <form action={deleteManagedGroup}>
                        <input type="hidden" name="groupId" value={group.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon-sm"
                          title={t("deleteGroup")}
                        >
                          <Trash2 />
                          <span className="sr-only">{t("deleteGroup")}</span>
                        </Button>
                      </form>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <WhatsAppInviteButton
                      inviteCode={group.inviteCode}
                      groupName={group.name}
                      entryFeeAgorot={group.entryFeeAgorot}
                      compact
                    />
                  </div>

                  {manager ? (
                    <>
                      <EditGroupForm
                        groupId={group.id}
                        name={group.name}
                        entryFeeAgorot={group.entryFeeAgorot}
                        hasImage={Boolean(group.imageUrl)}
                      />
                      <GroupPaymentForm
                        key={`${group.id}-${group.entryFeeAgorot}-${group.payment.bitUrl}-${group.payment.payboxUrl}-${group.payment.note}`}
                        groupId={group.id}
                        entryFeeAgorot={group.entryFeeAgorot}
                        payment={group.payment}
                      />
                    </>
                  ) : null}
                </header>

                <div className="p-4">
                  {hasConfiguredGroupPayment(group.payment) ? (
                    <GroupPaymentCard
                      entryFeeAgorot={group.entryFeeAgorot}
                      payment={group.payment}
                      locale={locale}
                    />
                  ) : manager && group.entryFeeAgorot > 0 ? (
                    <p className="text-muted-foreground mb-4 rounded-xl border border-dashed border-foreground/15 px-3.5 py-3 text-xs">
                      {t("paymentNotConfiguredBody")}
                    </p>
                  ) : null}

                  {manager && group.pendingRequests.length > 0 ? (
                    <section className="border-warning/25 bg-warning/[0.055] mb-4 rounded-xl border p-3">
                      <h4 className="text-warning flex items-center gap-1.5 text-sm font-semibold">
                        <Clock3 className="size-4" aria-hidden="true" />
                        {t("paymentRequests", { count: group.pendingRequests.length })}
                      </h4>
                      <p className="text-muted-foreground mt-1 text-xs text-pretty">
                        {t("paymentRequestsHint", { fee })}
                      </p>
                      <ul className="mt-2 divide-y divide-foreground/10">
                        {group.pendingRequests.map((request) => (
                          <li key={request.id} className="flex flex-wrap items-center gap-2 py-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {request.nickname}
                              </span>
                              {request.email ? (
                                <span dir="ltr" className="text-muted-foreground block truncate text-xs">
                                  {request.email}
                                </span>
                              ) : null}
                            </span>
                            <form action={approveGroupJoinRequest}>
                              <input type="hidden" name="groupId" value={group.id} />
                              <input type="hidden" name="requestId" value={request.id} />
                              <Button type="submit" size="xs">
                                <Check />
                                {t("confirmPaid")}
                              </Button>
                            </form>
                            <form action={declineGroupJoinRequest}>
                              <input type="hidden" name="groupId" value={group.id} />
                              <input type="hidden" name="requestId" value={request.id} />
                              <Button type="submit" size="icon-xs" variant="ghost" title={t("decline")}>
                                <X />
                                <span className="sr-only">{t("decline")}</span>
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <h4 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                    {t("roster")}
                  </h4>
                  <ul className="mt-1 divide-y divide-foreground/10 border-y border-foreground/10">
                    {group.members.map((member) => (
                      <li
                        key={member.userId}
                        className="flex min-h-12 flex-wrap items-center gap-3 py-2 sm:flex-nowrap"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {member.nickname}
                            {member.userId === userId ? ` ${t("you")}` : ""}
                          </span>
                          {member.email ? (
                            <span
                              dir="ltr"
                              className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs"
                            >
                              <Mail className="size-3" aria-hidden="true" />
                              {member.email}
                            </span>
                          ) : null}
                        </span>
                        {member.role === "manager" ? (
                          <span className="text-primary flex shrink-0 items-center gap-1 text-xs">
                            <Shield className="size-3.5" aria-hidden="true" />
                            {t("manager")}
                          </span>
                        ) : null}
                        {manager ? (
                          <div className="ms-auto flex shrink-0 items-center gap-1 sm:ms-0">
                            <form action={changeGroupMemberRole}>
                              <input type="hidden" name="groupId" value={group.id} />
                              <input type="hidden" name="memberId" value={member.userId} />
                              <input
                                type="hidden"
                                name="role"
                                value={member.role === "manager" ? "member" : "manager"}
                              />
                              <Button type="submit" variant="ghost" size="xs">
                                {member.role === "manager"
                                  ? t("makeMember")
                                  : t("makeManager")}
                              </Button>
                            </form>
                            <form action={removeGroupMember}>
                              <input type="hidden" name="groupId" value={group.id} />
                              <input type="hidden" name="memberId" value={member.userId} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon-xs"
                                title={t("remove")}
                              >
                                <Trash2 />
                                <span className="sr-only">{t("remove")}</span>
                              </Button>
                            </form>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatFee(agorot: number, locale: string): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(agorot / 100);
}

async function GroupPaymentCard({
  entryFeeAgorot,
  payment,
  locale,
}: {
  entryFeeAgorot: number;
  payment: GroupPaymentSettings;
  locale: string;
}) {
  const t = await getTranslations("groups");
  const amount = formatFee(entryFeeAgorot, locale);

  return (
    <aside className="border-primary/20 bg-primary/[0.06] mb-4 rounded-xl border p-3.5">
      <div className="flex items-start gap-3">
        <span className="bg-primary/12 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <WalletCards className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{t("paymentHeading")}</p>
          <p data-numeric className="mt-0.5 text-xl font-semibold tracking-tight">
            {amount}
          </p>
          {payment.note ? (
            <p className="text-muted-foreground mt-1 text-xs text-pretty">
              {payment.note}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={`${payment.bitUrl && payment.payboxUrl ? "grid-cols-2" : "grid-cols-1"} mt-3 grid gap-2`}
      >
        {payment.bitUrl ? (
          <PaymentLink
            href={payment.bitUrl}
            label={t("payWithBit")}
            provider="bit"
          />
        ) : null}
        {payment.payboxUrl ? (
          <PaymentLink
            href={payment.payboxUrl}
            label={t("payWithPaybox")}
            provider="paybox"
          />
        ) : null}
      </div>
      <p className="text-muted-foreground mt-2 text-[0.6875rem] leading-relaxed">
        {t("externalPaymentNotice")}
      </p>
    </aside>
  );
}

function PaymentLink({
  href,
  label,
  provider,
}: {
  href: string;
  label: string;
  provider: "bit" | "paybox";
}) {
  const isBit = provider === "bit";

  return (
    <Button
      asChild
      variant="outline"
      size="lg"
      className={
        isBit
          ? "h-12 w-full flex-1 justify-between gap-0 overflow-hidden rounded-xl border-cyan-300/35 bg-gradient-to-r from-cyan-400/15 to-blue-500/10 p-0 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_8px_22px_rgb(2_7_28/0.12)] hover:from-cyan-400/20 hover:to-blue-500/15"
          : "h-12 w-full flex-1 justify-between gap-0 overflow-hidden rounded-xl border-sky-300/35 bg-gradient-to-r from-sky-400/15 to-blue-500/10 p-0 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_8px_22px_rgb(2_7_28/0.12)] hover:from-sky-400/20 hover:to-blue-500/15"
      }
    >
      <a href={href} target="_blank" rel="external noopener noreferrer">
        <span className="flex min-w-0 flex-1 self-stretch items-center">
          <span className="relative h-full w-10 shrink-0 self-stretch overflow-hidden shadow-[0_4px_12px_rgb(2_7_28/0.22)] sm:w-16">
            <Image
              src={isBit ? "/bit-transparent.png" : "/paybox.jpg"}
              alt=""
              fill
              sizes="64px"
              className={
                isBit
                  ? "scale-[1.24] object-cover"
                  : "scale-[1.15] object-cover"
              }
            />
          </span>
          <span className="min-w-0 flex-1 truncate px-2 text-start text-xs font-semibold sm:px-3 sm:text-sm">
            {label}
          </span>
        </span>
        <ExternalLink
          className="text-muted-foreground me-3 hidden size-4 shrink-0 opacity-70 transition-opacity duration-150 group-hover/button:opacity-100 sm:block"
          aria-hidden="true"
        />
      </a>
    </Button>
  );
}
