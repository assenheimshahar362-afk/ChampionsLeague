"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  adminRunAiPredictions,
  type AdminAiPredictionState,
} from "@/lib/admin/actions";

const initialState: AdminAiPredictionState = { status: "idle" };

export function AiPredictionRunner() {
  const t = useTranslations("admin.aiCostAdmin");
  const [state, action, pending] = useActionState(
    adminRunAiPredictions,
    initialState
  );

  return (
    <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
      <Button type="submit" disabled={pending}>
        <Sparkles aria-hidden="true" />
        {pending ? t("runningNow") : t("runNow")}
      </Button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={
            state.status === "success"
              ? "text-success text-xs"
              : "text-destructive max-w-xl text-xs"
          }
        >
          {state.status === "success"
            ? t("runSuccess", {
                generated: state.generated,
                skipped: state.skipped,
              })
            : t("runError", {
                generated: state.generated,
                failed: state.failed,
                error: state.error ?? t("unknownError"),
              })}
        </p>
      ) : null}
    </form>
  );
}
