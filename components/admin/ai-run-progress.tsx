"use client";

import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type RunOutcome = "idle" | "success" | "error";

const STAGES = [
  { afterMs: 0, percent: 8, key: "preparing" },
  { afterMs: 600, percent: 20, key: "loadingData" },
  { afterMs: 1_400, percent: 34, key: "buildingPrompt" },
  { afterMs: 2_400, percent: 48, key: "sending" },
  { afterMs: 3_600, percent: 64, key: "researching" },
  { afterMs: 6_500, percent: 80, key: "processing" },
  { afterMs: 10_500, percent: 94, key: "saving" },
] as const;

export function AiRunProgress({
  pending,
  outcome,
}: {
  pending: boolean;
  outcome: RunOutcome;
}) {
  const t = useTranslations("admin.aiProgress");
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!pending) return;
    const timers = STAGES.slice(1).map((stage, index) =>
      window.setTimeout(() => setStageIndex(index + 1), stage.afterMs)
    );
    return () => timers.forEach(window.clearTimeout);
  }, [pending]);

  if (!pending && outcome === "idle") return null;

  const runningStage = STAGES[stageIndex] ?? STAGES[0];
  const percent = pending ? runningStage.percent : 100;
  const label = pending
    ? t(runningStage.key)
    : outcome === "success"
      ? t("complete")
      : t("failed");
  const tone = outcome === "error" && !pending ? "destructive" : "primary";

  return (
    <div
      className="bg-background/35 w-full rounded-xl border border-white/10 p-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          {pending ? (
            <LoaderCircle className="text-primary size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
          ) : outcome === "success" ? (
            <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert className="text-destructive size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-bold tabular-nums" data-numeric>
          {percent}%
        </span>
      </div>
      <div
        className="bg-muted mt-2 h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={t("label")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={label}
      >
        <div
          className={
            tone === "destructive"
              ? "bg-destructive h-full rounded-full transition-[width] duration-[250ms] ease-out motion-reduce:transition-none"
              : outcome === "success" && !pending
                ? "bg-success h-full rounded-full transition-[width] duration-[250ms] ease-out motion-reduce:transition-none"
                : "bg-primary h-full rounded-full transition-[width] duration-[250ms] ease-out motion-reduce:transition-none"
          }
          style={{ width: `${percent}%` }}
        />
      </div>
      {pending ? (
        <p className="text-muted-foreground mt-2 text-[0.65rem]">
          {t("estimatedNote")}
        </p>
      ) : null}
    </div>
  );
}
