"use client";

import {
  Banknote,
  Camera,
  Check,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createGroup,
  updateGroup,
  updateGroupPayment,
  type GroupActionState,
} from "@/lib/groups/actions";
import {
  hasConfiguredGroupPayment,
  type GroupPaymentSettings,
} from "@/lib/groups/payment";

const initialState: GroupActionState = { status: "idle" };

function Message({ state }: { state: GroupActionState }) {
  const t = useTranslations("groups.errors");
  if (state.status !== "error") return null;
  return (
    <p role="alert" className="text-destructive text-xs">
      {t(state.code)}
    </p>
  );
}

function SuccessMessage({ payment = false }: { payment?: boolean }) {
  const t = useTranslations("groups");
  return (
    <p role="status" className="text-success flex items-center gap-1 text-xs">
      <Check className="size-3.5" aria-hidden="true" />
      {t(payment ? "paymentSaved" : "saved")}
    </p>
  );
}

export function CreateGroupForm() {
  const t = useTranslations("groups");
  const [state, action, pending] = useActionState(createGroup, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div className="space-y-1.5">
          <Label htmlFor="group-name">{t("groupName")}</Label>
          <Input
            id="group-name"
            name="name"
            required
            minLength={2}
            maxLength={60}
            placeholder={t("groupNamePlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="group-entry-fee" className="flex items-center gap-1.5">
            <Banknote className="size-4" aria-hidden="true" />
            {t("entryFee")}
          </Label>
          <div className="relative" dir="ltr">
            <Input
              id="group-entry-fee"
              name="entryFee"
              type="number"
              inputMode="decimal"
              min="0"
              max="1000000"
              step="0.01"
              defaultValue="0"
              required
              className="ps-9 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-xs" aria-hidden="true">
              ₪
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="group-image" className="flex items-center gap-1.5">
          <Camera className="size-4" aria-hidden="true" />
          {t("groupImage")}
        </Label>
        <Input
          id="group-image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="h-10 py-1.5"
        />
        <p className="text-muted-foreground text-xs">{t("imageHint")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          {pending ? t("creating") : t("create")}
        </Button>
        {state.status === "success" ? <SuccessMessage /> : null}
      </div>
      <Message state={state} />
    </form>
  );
}

export function EditGroupForm({
  groupId,
  name,
  entryFeeAgorot,
  hasImage,
}: {
  groupId: string;
  name: string;
  entryFeeAgorot: number;
  hasImage: boolean;
}) {
  const t = useTranslations("groups");
  const [state, action, pending] = useActionState(updateGroup, initialState);
  const fee =
    entryFeeAgorot % 100 === 0
      ? String(entryFeeAgorot / 100)
      : (entryFeeAgorot / 100).toFixed(2);

  return (
    <details className="group/edit border-foreground/10 mt-3 rounded-xl border bg-background/20">
      <summary className="hover:bg-foreground/[0.035] flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors">
        <Pencil className="text-primary size-4" aria-hidden="true" />
        {t("editGroup")}
      </summary>
      <form action={action} className="space-y-3 border-t border-foreground/10 p-3">
        <input type="hidden" name="groupId" value={groupId} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-name-${groupId}`}>{t("groupName")}</Label>
            <Input
              id={`edit-name-${groupId}`}
              name="name"
              defaultValue={name}
              minLength={2}
              maxLength={60}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-fee-${groupId}`}>{t("entryFee")}</Label>
            <div className="relative" dir="ltr">
              <Input
                id={`edit-fee-${groupId}`}
                name="entryFee"
                type="number"
                inputMode="decimal"
                min="0"
                max="1000000"
                step="0.01"
                defaultValue={fee}
                required
                className="ps-9 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-xs" aria-hidden="true">
                ₪
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`edit-image-${groupId}`}>{t("replaceImage")}</Label>
          <Input
            id={`edit-image-${groupId}`}
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="h-10 py-1.5"
          />
        </div>
        {hasImage ? (
          <div className="flex items-center gap-2">
            <Checkbox id={`remove-image-${groupId}`} name="removeImage" />
            <Label htmlFor={`remove-image-${groupId}`} className="font-normal">
              {t("removeImage")}
            </Label>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            {pending ? t("saving") : t("save")}
          </Button>
          {state.status === "success" ? <SuccessMessage /> : null}
        </div>
        <Message state={state} />
      </form>
    </details>
  );
}

export function GroupPaymentForm({
  groupId,
  entryFeeAgorot,
  payment,
}: {
  groupId: string;
  entryFeeAgorot: number;
  payment: GroupPaymentSettings;
}) {
  const t = useTranslations("groups");
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    updateGroupPayment,
    initialState
  );
  const hasEntryFee = entryFeeAgorot > 0;
  const fee = formatFee(entryFeeAgorot, locale);

  return (
    <details className="group/payment border-foreground/10 mt-4 rounded-xl border bg-background/25">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm font-medium select-none">
        <CreditCard className="text-primary size-4" aria-hidden="true" />
        <span className="flex-1">{t("paymentManage")}</span>
        <span className="text-muted-foreground text-xs group-open/payment:hidden">
          {hasConfiguredGroupPayment(payment)
            ? t("paymentConfigured")
            : t("paymentNotConfigured")}
        </span>
      </summary>
      <form action={action} className="space-y-3 border-t border-foreground/10 p-3.5">
        <input type="hidden" name="groupId" value={groupId} />

        <p className={hasEntryFee ? "text-muted-foreground text-xs" : "text-warning text-xs"}>
          {hasEntryFee
            ? t("paymentAmountHint", { fee })
            : t("paymentRequiresFee")}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`bit-link-${groupId}`}>{t("bitLink")}</Label>
            <Input
              id={`bit-link-${groupId}`}
              name="bitUrl"
              type="url"
              inputMode="url"
              dir="ltr"
              defaultValue={payment.bitUrl ?? ""}
              placeholder="https://…"
              maxLength={2048}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor={`paybox-link-${groupId}`}>{t("payboxLink")}</Label>
            <Input
              id={`paybox-link-${groupId}`}
              name="payboxUrl"
              type="url"
              inputMode="url"
              dir="ltr"
              defaultValue={payment.payboxUrl ?? ""}
              placeholder="https://…"
              maxLength={2048}
              className="mt-1.5"
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{t("paymentLinkHint")}</p>

        <div>
          <Label htmlFor={`payment-note-${groupId}`}>{t("paymentNote")}</Label>
          <Input
            id={`payment-note-${groupId}`}
            name="paymentNote"
            defaultValue={payment.note ?? ""}
            placeholder={t("paymentNotePlaceholder")}
            maxLength={160}
            className="mt-1.5"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending || !hasEntryFee}>
            {pending ? <Loader2 className="animate-spin" /> : <CreditCard />}
            {t("savePayment")}
          </Button>
          <span className="text-muted-foreground text-xs">
            {t("paymentClearHint")}
          </span>
        </div>
        {state.status === "success" ? <SuccessMessage payment /> : null}
        <Message state={state} />
      </form>
    </details>
  );
}

function formatFee(agorot: number, locale: string): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(agorot / 100);
}
