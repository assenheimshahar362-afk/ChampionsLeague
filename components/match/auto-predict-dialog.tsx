"use client";

import { ListPlus, RefreshCcw, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { AutoPredictionMode } from "@/lib/predictions/actions";

export function AutoPredictDialog({
  totalCount,
  missingCount,
  onChoose,
}: {
  totalCount: number;
  missingCount: number;
  onChoose: (mode: AutoPredictionMode) => Promise<boolean>;
}) {
  const t = useTranslations("match.autoPredict");
  const [open, setOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<AutoPredictionMode | null>(null);
  const [failed, setFailed] = useState(false);

  async function choose(mode: AutoPredictionMode) {
    setFailed(false);
    setPendingMode(mode);
    const saved = await onChoose(mode);
    setPendingMode(null);
    if (saved) setOpen(false);
    else setFailed(true);
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setFailed(false);
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="border-primary/25 bg-primary/10 text-primary h-9 rounded-full border px-4 shadow-[0_8px_22px_rgb(0_0_0/0.12)]"
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {t("trigger")}
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/65 opacity-100 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-150 data-[state=closed]:opacity-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-popover p-5 text-popover-foreground opacity-100 shadow-2xl outline-none motion-safe:transition-[transform,opacity] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="bg-primary/12 text-primary mb-3 inline-flex size-10 items-center justify-center rounded-xl">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <DialogPrimitive.Title className="text-lg font-bold">
                {t("title")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm leading-relaxed text-balance">
                {t("description")}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={t("close")}
                disabled={pendingMode !== null}
              >
                <X aria-hidden="true" />
                <span className="sr-only">{t("close")}</span>
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="mt-5 space-y-2.5">
            <button
              type="button"
              disabled={pendingMode !== null || missingCount === 0}
              className="border-primary/25 bg-primary/[0.07] focus-visible:ring-primary/40 group flex w-full items-center gap-3 rounded-xl border p-3.5 text-start outline-none transition-[background-color,border-color,transform] duration-150 ease-snap active:scale-[0.98] focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-45"
              onClick={() => void choose("missing")}
            >
              <span className="bg-primary/12 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
                <ListPlus className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  {pendingMode === "missing" ? t("saving") : t("missingTitle")}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                  {missingCount === 0
                    ? t("nothingMissing")
                    : t("missingBody", { count: missingCount })}
                </span>
              </span>
            </button>

            <button
              type="button"
              disabled={pendingMode !== null || totalCount === 0}
              className="border-border bg-background/35 focus-visible:ring-ring group flex w-full items-center gap-3 rounded-xl border p-3.5 text-start outline-none transition-[background-color,border-color,transform] duration-150 ease-snap active:scale-[0.98] focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-45"
              onClick={() => void choose("all")}
            >
              <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                <RefreshCcw className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  {pendingMode === "all" ? t("saving") : t("allTitle")}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                  {t("allBody", { count: totalCount })}
                </span>
              </span>
            </button>
          </div>

          <p className="text-muted-foreground mt-4 text-center text-[11px] leading-relaxed text-balance">
            {t("oddsNote")}
          </p>
          {failed ? (
            <p role="alert" className="text-destructive mt-3 text-center text-xs">
              {t("error")}
            </p>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
