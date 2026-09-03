"use client";

import { PencilLine, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";

import { NicknameForm } from "@/components/onboarding/nickname-form";
import { Button } from "@/components/ui/button";

export function ProfileNicknameDialog({
  displayName,
  next,
}: {
  displayName: string;
  next: string;
}) {
  const t = useTranslations("profile.account");

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="group -mx-1 flex max-w-full cursor-pointer items-center gap-2 rounded-lg px-1 text-start outline-none transition-[color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title={t("editNickname")}
          aria-label={t("editNickname")}
        >
          <span className="truncate">{displayName}</span>
          <PencilLine
            className="text-muted-foreground size-4 shrink-0 transition-colors duration-150 group-hover:text-primary group-focus-visible:text-primary sm:size-[1.125rem]"
            aria-hidden="true"
          />
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/65 opacity-100 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-150 data-[state=closed]:opacity-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-popover p-5 text-popover-foreground opacity-100 shadow-2xl outline-none motion-safe:transition-[transform,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">
                {t("nicknameDialogTitle")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                {t("nicknameDialogDescription")}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon-sm" title={t("close")}>
                <X aria-hidden="true" />
                <span className="sr-only">{t("close")}</span>
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="mt-5">
            <NicknameForm
              next={next}
              defaultValue={displayName}
              submitLabel={t("saveNickname")}
              surface={false}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
