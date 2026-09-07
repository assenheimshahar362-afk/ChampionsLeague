"use client";

import { Lock } from "lucide-react";
import { Popover } from "radix-ui";

import { cn } from "@/lib/utils";

const SCORES = Array.from({ length: 10 }, (_, score) => score);

/** A score trigger with an anchored, one-tap 0-9 picker. */
export function ScoreBox({
  value,
  onSelect,
  open,
  onOpenChange,
  disabled,
  label,
  highlight,
  filled,
  className,
}: {
  value: number | null;
  onSelect: (next: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  label: string;
  highlight?: boolean;
  filled?: boolean;
  className?: string;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          aria-expanded={open}
          className={cn(
            "size-11 shrink-0 rounded-xl border-2 text-center text-xl font-semibold",
            "focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2 focus-visible:outline-none",
            "active:scale-[0.97] motion-safe:transition-[color,background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-snap",
            // The wrapping sign-in link receives taps while this is disabled.
            "disabled:text-muted-foreground disabled:pointer-events-none",
            filled
              ? "border-primary/60 bg-primary/15 backdrop-blur-md"
              : "border-white/20 bg-background/30 backdrop-blur-md",
            highlight && "border-primary bg-primary/20",
            open && "border-primary bg-primary/20 ring-primary/25 ring-2",
            className
          )}
          data-numeric
        >
          {value ?? ""}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={10}
          collisionPadding={12}
          aria-label={label}
          className={cn(
            "bg-popover/95 text-popover-foreground z-50 rounded-xl border border-primary/45 p-1.5 shadow-[0_18px_45px_rgb(0_0_0/0.5)] backdrop-blur-xl outline-none",
            "w-[min(22rem,calc(100vw-1.5rem))] [transform-origin:var(--radix-popover-content-transform-origin)]"
          )}
        >
          <div
            role="radiogroup"
            aria-label={label}
            dir="ltr"
            className="grid grid-cols-10 gap-0.5"
          >
            {SCORES.map((score) => {
              const selected = value === score;
              return (
                <button
                  key={score}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${label}: ${score}`}
                  data-numeric
                  onClick={() => onSelect(score)}
                  className={cn(
                    "focus-visible:ring-primary/40 flex aspect-square min-w-0 items-center justify-center rounded-lg text-base font-semibold outline-none",
                    "active:scale-[0.94] motion-safe:transition-[color,background-color,transform,box-shadow] motion-safe:duration-150 motion-safe:ease-snap",
                    selected
                      ? "bg-primary text-primary-foreground shadow-[0_0_16px_oklch(0.72_0.15_245/0.45)]"
                      : "text-foreground hover:bg-primary/12"
                  )}
                >
                  {score}
                </button>
              );
            })}
          </div>
          <Popover.Arrow className="fill-primary/45" width={16} height={8} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The solid prediction tile between the two score controls. */
export function GuessChip({
  locked,
  label,
  className,
}: {
  locked?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-none text-[11px] font-bold",
        "transition-colors duration-150 ease-tint",
        locked
          ? "bg-muted/55 text-muted-foreground backdrop-blur-md"
          : "border-y border-pick-shadow/80 bg-[linear-gradient(180deg,var(--pick-highlight)_0%,var(--pick)_48%,var(--pick-shadow)_100%)] text-pick-foreground [text-shadow:0_1px_0_rgb(255_255_255/0.28)] shadow-[inset_0_1px_0_rgb(255_255_255/0.58),inset_0_-2px_0_rgb(88_54_8/0.34),0_3px_8px_rgb(8_4_24/0.34)]",
        className
      )}
      aria-hidden="true"
    >
      {locked ? <Lock className="size-3.5" /> : label}
    </span>
  );
}
