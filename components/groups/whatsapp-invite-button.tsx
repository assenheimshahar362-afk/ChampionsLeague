"use client";

import { MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function WhatsAppInviteButton({
  inviteCode,
  groupName,
  entryFeeAgorot,
  compact = false,
}: {
  inviteCode: string;
  groupName: string;
  entryFeeAgorot: number;
  compact?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("groups");

  function openWhatsApp() {
    const inviteUrl = `${window.location.origin}/${locale}/g/${inviteCode}`;
    const fee =
      entryFeeAgorot === 0
        ? t("freeEntry")
        : new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
            style: "currency",
            currency: "ILS",
          }).format(entryFeeAgorot / 100);
    const message = t("whatsappMessage", { group: groupName, fee, url: inviteUrl });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "sm" : "default"}
      onClick={openWhatsApp}
    >
      <MessageCircle aria-hidden="true" />
      {t("shareWhatsApp")}
    </Button>
  );
}
