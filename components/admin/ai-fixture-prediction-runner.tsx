"use client";

import { BrainCircuit, ExternalLink, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useActionState, useEffect, useRef, useState } from "react";

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

type PredictionDetails = {
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  confidence: number;
  summaryEn: string;
  summaryHe: string;
  keyFactorsEn: string[];
  keyFactorsHe: string[];
  sources: Array<{ title: string; url: string }>;
};

type UsageDetails = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  reservedCostUsd: number;
  estimatedCostUsd: number | null;
  completedAt: string | null;
};

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
  homeTeam,
  awayTeam,
  predictionDetails,
  usageDetails,
}: {
  fixtureId: string;
  currentModel: string | null;
  currentEstimatedCostUsd: number | null;
  currentGeneratedAt: string | null;
  availability: AiPredictionFixtureAvailability;
  homeTeam: string;
  awayTeam: string;
  predictionDetails: PredictionDetails | null;
  usageDetails: UsageDetails | null;
}) {
  const t = useTranslations("admin.fixtureAdmin");
  const locale = useLocale();
  const router = useRouter();
  const refreshedGeneration = useRef<string | null>(null);
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
  const number = new Intl.NumberFormat(locale);
  const summary = locale === "he"
    ? predictionDetails?.summaryHe
    : predictionDetails?.summaryEn;
  const factors = locale === "he"
    ? predictionDetails?.keyFactorsHe ?? []
    : predictionDetails?.keyFactorsEn ?? [];

  useEffect(() => {
    if (
      state.status === "success" &&
      state.generatedAt &&
      refreshedGeneration.current !== state.generatedAt
    ) {
      refreshedGeneration.current = state.generatedAt;
      router.refresh();
    }
  }, [router, state]);

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
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{t("aiPick")}</dt>
              <dd className="mt-1 text-lg font-bold" dir="ltr" data-numeric>
                {predictionDetails
                  ? `${predictionDetails.predictedHomeGoals}-${predictionDetails.predictedAwayGoals}`
                  : "—"}
              </dd>
            </div>
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
        {predictionDetails || usageDetails ? (
          <DialogPrimitive.Root>
            <DialogPrimitive.Trigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full active:scale-[0.98]"
              >
                <BrainCircuit aria-hidden="true" />
                {t("openDetails")}
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/65 opacity-100 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-150 data-[state=closed]:opacity-0" />
              <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/15 bg-popover p-5 text-popover-foreground opacity-100 shadow-2xl outline-none motion-safe:transition-[transform,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogPrimitive.Title className="text-lg font-bold">
                      {homeTeam} – {awayTeam}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                      {t("detailsDescription")}
                    </DialogPrimitive.Description>
                  </div>
                  <DialogPrimitive.Close asChild>
                    <Button type="button" variant="ghost" size="icon-sm" title={t("closeDetails")}>
                      <X aria-hidden="true" />
                      <span className="sr-only">{t("closeDetails")}</span>
                    </Button>
                  </DialogPrimitive.Close>
                </div>

                {predictionDetails ? (
                  <div className="mt-5 space-y-5">
                    <section className="bg-primary/[0.07] rounded-xl border border-primary/20 p-4 text-center">
                      <p className="text-muted-foreground text-xs">{t("aiPick")}</p>
                      <p className="mt-1 text-4xl font-black tracking-tight" dir="ltr" data-numeric>
                        {predictionDetails.predictedHomeGoals} – {predictionDetails.predictedAwayGoals}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t("confidence", { value: predictionDetails.confidence })}
                      </p>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold">{t("probabilities")}</h3>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {[
                          [homeTeam, predictionDetails.homeWinProbability],
                          [t("draw"), predictionDetails.drawProbability],
                          [awayTeam, predictionDetails.awayWinProbability],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="bg-background/35 rounded-lg border border-white/10 p-2 text-center">
                            <p className="truncate text-[0.7rem]" dir="auto">{label}</p>
                            <p className="mt-1 text-lg font-bold" data-numeric>{value}%</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-semibold">{t("analysis")}</h3>
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{summary}</p>
                      {factors.length > 0 ? (
                        <ul className="text-muted-foreground mt-3 list-disc space-y-1 ps-5 text-sm">
                          {factors.map((factor) => <li key={factor}>{factor}</li>)}
                        </ul>
                      ) : null}
                    </section>
                  </div>
                ) : null}

                {usageDetails ? (
                  <section className="mt-5 border-t border-white/10 pt-5">
                    <h3 className="text-sm font-semibold">{t("usageTitle")}</h3>
                    <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <DetailValue label={t("inputTokens")} value={number.format(usageDetails.inputTokens)} />
                      <DetailValue label={t("cachedInputTokens")} value={number.format(usageDetails.cachedInputTokens)} />
                      <DetailValue label={t("cacheWriteTokens")} value={number.format(usageDetails.cacheWriteTokens)} />
                      <DetailValue label={t("outputTokens")} value={number.format(usageDetails.outputTokens)} />
                      <DetailValue label={t("webSearches")} value={number.format(usageDetails.webSearchCalls)} />
                      <DetailValue
                        label={t("actualEstimatedCost")}
                        value={usageDetails.estimatedCostUsd === null ? t("costUnavailable") : formatUsd(usageDetails.estimatedCostUsd)}
                      />
                      <DetailValue label={t("reservedCost")} value={formatUsd(usageDetails.reservedCostUsd)} />
                    </dl>
                  </section>
                ) : null}

                {predictionDetails && predictionDetails.sources.length > 0 ? (
                  <section className="mt-5 border-t border-white/10 pt-5">
                    <h3 className="text-sm font-semibold">{t("sources")}</h3>
                    <ul className="mt-2 space-y-2">
                      {predictionDetails.sources.map((source) => (
                        <li key={source.url}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                          >
                            {source.title}
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
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

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/35 rounded-lg border border-white/10 p-3">
      <dt className="text-muted-foreground text-[0.7rem]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums" dir="ltr">
        {value}
      </dd>
    </div>
  );
}
