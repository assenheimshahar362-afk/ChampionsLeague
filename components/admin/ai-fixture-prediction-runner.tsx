"use client";

import { Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import type { AiPredictionFixtureAvailability } from "@/lib/ai-predictions/horizon";

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
  currentGeneratedAt,
  availability,
}: {
  fixtureId: string;
  currentModel: string | null;
  currentEstimatedCostUsd: number | null;
  currentGeneratedAt: string | null;
  availability: AiPredictionFixtureAvailability;
}) {
  const t = useTranslations("admin.fixtureAdmin");
  const locale = useLocale();
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
  const hasPrediction = state.status === "success" || currentModel !== null;
  const displayedModel = state.status === "success" ? state.model : currentModel;
  const displayedCost =
    state.status === "success"
      ? state.estimatedCostUsd
      : currentEstimatedCostUsd;
  const displayedGeneratedAt =
    state.status === "success" ? state.generatedAt : currentGeneratedAt;

  return (
    <div className="space-y-3">
      <div className="bg-background/30 rounded-lg border border-white/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold">{t("predictionStatus")}</p>
          <span
            className={
              hasPrediction
                ? "bg-success/15 text-success rounded-full px-2 py-1 text-[0.7rem] font-semibold"
                : "bg-warning/15 text-warning rounded-full px-2 py-1 text-[0.7rem] font-semibold"
            }
          >
            {t(hasPrediction ? "predictionExists" : "predictionMissing")}
          </span>
        </div>
        {hasPrediction ? (
          <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">{t("usedModel")}</dt>
              <dd className="mt-1 font-semibold" dir="ltr">{displayedModel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("generatedAt")}</dt>
              <dd className="mt-1 font-semibold">
                {displayedGeneratedAt
                  ? new Intl.DateTimeFormat(locale, {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(displayedGeneratedAt))
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("actualEstimatedCost")}</dt>
              <dd className="mt-1 font-semibold" dir="ltr">
                {displayedCost === null ? t("costUnavailable") : formatUsd(displayedCost)}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      {availability !== "closed" ? (
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
        <Button
          type="submit"
          size="sm"
          disabled={pending || availability !== "eligible"}
          className="self-end"
        >
          <Sparkles aria-hidden="true" />
          {pending ? t("predicting") : t("predictNow")}
        </Button>
        <div className="text-muted-foreground text-[0.7rem] sm:col-span-2">
          <p>{t("estimatedBefore", { cost: formatUsd(beforeUsd) })}</p>
          {availability === "too-early" ? (
            <p className="text-warning mt-1">{t("availableWithinHorizon")}</p>
          ) : null}
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
          ) : null}
        </div>
        </form>
      ) : null}
    </div>
  );
}
