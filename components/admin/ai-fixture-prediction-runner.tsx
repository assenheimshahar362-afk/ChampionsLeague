"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  adminRunAiFixturePrediction,
  type AdminAiFixturePredictionState,
} from "@/lib/admin/actions";
import {
  AI_PREDICTION_MODELS,
  estimateTypicalPredictionCostMicrousd,
  type AiPredictionModel,
} from "@/lib/ai-predictions/cost";

const initialState: AdminAiFixturePredictionState = { status: "idle" };

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

export function AiFixturePredictionRunner({
  fixtureId,
  currentModel,
  currentEstimatedCostUsd,
}: {
  fixtureId: string;
  currentModel: string | null;
  currentEstimatedCostUsd: number | null;
}) {
  const t = useTranslations("admin.fixtureAdmin");
  const initialModel = AI_PREDICTION_MODELS.some(
    (model) => model.id === currentModel
  )
    ? (currentModel as AiPredictionModel)
    : "gpt-5.6-luna";
  const [model, setModel] = useState<AiPredictionModel>(initialModel);
  const [state, action, pending] = useActionState(
    adminRunAiFixturePrediction,
    initialState
  );
  const beforeUsd = estimateTypicalPredictionCostMicrousd(model) / 1_000_000;

  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <label className="text-xs">
        <span className="text-muted-foreground mb-1 block">{t("model")}</span>
        <select
          name="model"
          value={model}
          onChange={(event) => setModel(event.target.value as AiPredictionModel)}
          disabled={pending}
          className="h-9 w-full rounded-lg border border-white/20 bg-background/45 px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {AI_PREDICTION_MODELS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} · ~{formatUsd(
                estimateTypicalPredictionCostMicrousd(option.id) / 1_000_000
              )}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={pending} className="self-end">
        <Sparkles aria-hidden="true" />
        {pending ? t("predicting") : t("predictNow")}
      </Button>
      <div className="text-muted-foreground text-[0.7rem] sm:col-span-2">
        <p>{t("estimatedBefore", { cost: formatUsd(beforeUsd) })}</p>
        {state.status === "success" ? (
          <p className="text-success mt-1" role="status">
            {t("estimatedAfter", {
              cost: formatUsd(state.estimatedCostUsd ?? 0),
              model: state.model,
            })}
          </p>
        ) : state.status === "error" ? (
          <p className="text-destructive mt-1" role="status">
            {t("predictionError", { error: state.error ?? "Unknown error" })}
          </p>
        ) : currentEstimatedCostUsd !== null ? (
          <p className="mt-1">
            {t("lastEstimatedAfter", {
              cost: formatUsd(currentEstimatedCostUsd),
              model: currentModel ?? "—",
            })}
          </p>
        ) : null}
      </div>
    </form>
  );
}
