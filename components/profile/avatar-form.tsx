"use client";

import { Camera, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAvatar, type AvatarState } from "@/lib/profile/actions";

const initialState: AvatarState = { status: "idle" };

export function AvatarForm({
  avatarUrl,
  seed,
  displayName,
  showPreview = true,
}: {
  avatarUrl: string | null;
  seed: string;
  displayName: string;
  showPreview?: boolean;
}) {
  const t = useTranslations("profile.avatar");
  const [state, action, pending] = useActionState(saveAvatar, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const error = state.status === "error" ? t(`errors.${state.code}`) : null;

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <div
      className={
        showPreview
          ? "grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center"
          : "min-w-0"
      }
    >
      {showPreview ? (
        <div className="bg-background/45 relative mx-auto flex size-28 items-center justify-center overflow-hidden rounded-full border border-foreground/15 shadow-[0_12px_32px_rgb(3_7_25/0.16)] sm:mx-0">
          <ProfileAvatar
            avatarUrl={avatarUrl}
            seed={seed}
            alt={t("alt", { name: displayName })}
            sizes="112px"
          />
        </div>
      ) : null}

      <form ref={formRef} action={action} className="min-w-0 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="profile-avatar" className="flex items-center gap-1.5">
            <Camera className="size-4" aria-hidden="true" />
            {t("label")}
          </Label>
          <Input
            id="profile-avatar"
            name="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "avatar-error" : "avatar-hint"}
            className="h-10 py-1.5"
          />
          <p id="avatar-hint" className="text-muted-foreground text-xs">
            {t("hint")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Camera aria-hidden="true" />
            )}
            {pending ? t("uploading") : t("submit")}
          </Button>
          {state.status === "success" ? (
            <p role="status" className="text-success flex items-center gap-1 text-xs">
              <Check className="size-3.5" aria-hidden="true" />
              {t("success")}
            </p>
          ) : null}
        </div>

        {error ? (
          <p id="avatar-error" role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
