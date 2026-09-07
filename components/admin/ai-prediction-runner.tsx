"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { AiRunProgress } from "@/components/admin/ai-run-progress";
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
    <form action={action} className="flex w-full flex-col items-start gap-2 sm:min-w-80 sm:items-end">
      <label className="w-full text-xs">
        <span className="text-muted-foreground mb-1 block">{t("scope")}</span>
        <select
          name="scope"
          defaultValue="horizon"
          disabled={pending}
          className="h-9 w-full rounded-lg border border-white/20 bg-background/45 px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="horizon">{t("scopeHorizon")}</option>
          <option value="upcoming-round">{t("scopeUpcomingWeek")}</option>
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        <Sparkles aria-hidden="true" />
        {pending ? t("runningNow") : t("runNow")}
      </Button>
      <AiRunProgress
        key={pending ? "running" : state.status}
        pending={pending}
        outcome={state.status}
      />
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
