"use client";

import { Loader2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { formSurfaceStyles } from "@/components/ui/form-surface";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveNickname, type NicknameState } from "@/lib/profile/actions";
import { cn } from "@/lib/utils";

const initialState: NicknameState = { status: "idle" };

export function NicknameForm({
  next,
  defaultValue,
  submitLabel,
  surface = true,
  className,
}: {
  next: string;
  defaultValue?: string;
  submitLabel?: string;
  surface?: boolean;
  className?: string;
}) {
  const t = useTranslations("nickname");
  const [state, action, pending] = useActionState(saveNickname, initialState);
  const error = state.status === "error" ? t(`errors.${state.code}`) : null;

  return (
    <form
      action={action}
      className={
        surface
          ? formSurfaceStyles("mt-7 space-y-5 p-5 sm:p-6", className)
          : cn("space-y-5", className)
      }
    >
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <Label htmlFor="nickname">{t("label")}</Label>
        <div className="relative">
          <UserRound
            className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            id="nickname"
            name="nickname"
            type="text"
            autoComplete="nickname"
            defaultValue={defaultValue}
            required
            minLength={2}
            maxLength={30}
            className="ps-9"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "nickname-error" : "nickname-hint"}
          />
        </div>
        <p id="nickname-hint" className="text-muted-foreground text-xs">
          {t("hint")}
        </p>
      </div>

      {error ? (
        <p id="nickname-error" role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("saving")}
          </>
        ) : (
          submitLabel ?? t("submit")
        )}
      </Button>
    </form>
  );
}
