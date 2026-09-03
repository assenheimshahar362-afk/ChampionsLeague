"use client";

import { Camera, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";

import { AvatarForm } from "@/components/profile/avatar-form";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProfileAvatarDialog({
  avatarUrl,
  seed,
  displayName,
  className,
}: {
  avatarUrl: string | null;
  seed: string;
  displayName: string;
  className?: string;
}) {
  const t = useTranslations("profile.avatar");
  const alt = t("alt", { name: displayName });

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group relative block cursor-pointer rounded-[inherit] outline-none transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className
          )}
          title={t("change")}
          aria-label={t("change")}
        >
          <ProfileAvatar
            avatarUrl={avatarUrl}
            seed={seed}
            alt={alt}
            sizes="(min-width: 640px) 88px, 72px"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="size-5 text-white" aria-hidden="true" />
          </span>
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-safe:transition-opacity motion-safe:duration-150" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-popover p-5 text-popover-foreground shadow-2xl outline-none data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100 motion-safe:transition-[transform,opacity] motion-safe:duration-150 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">
                {t("dialogTitle")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                {t("dialogDescription")}
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
            <AvatarForm
              avatarUrl={avatarUrl}
              seed={seed}
              displayName={displayName}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
