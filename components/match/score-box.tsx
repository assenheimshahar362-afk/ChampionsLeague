"use client";

import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

const MAX_GOALS = 15;

/**
 * A single goal input, drawn as the bordered square from the reference design.
 *
 * Tapping opens the numeric keypad (`inputMode`), which is what the reference
 * app does. Arrow keys also step the value, so the control stays fully
 * operable from a keyboard — §8 requires that of the prediction inputs.
 */
export function ScoreBox({
  value,
  onChange,
  disabled,
  label,
  highlight,
  filled,
  className,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  label: string;
  /** Marks the side the current prediction has winning. */
  highlight?: boolean;
  /**
   * The fixture has a prediction on it.
   *
   * An empty bordered square and a filled one read as the same control at a
   * glance, which made a half-completed matchday impossible to scan. Giving the
   * answered state a surface makes "done" and "to do" different shapes.
   */
  filled?: boolean;
  className?: string;
}) {
  function commit(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits === "") {
      onChange(null);
      return;
    }
    // Keep the last two digits typed, then clamp — typing "12" over a "3"
    // should read 12, not be rejected.
    onChange(Math.min(MAX_GOALS, Number(digits.slice(-2))));
  }

  function step(delta: number) {
    onChange(Math.min(MAX_GOALS, Math.max(0, (value ?? 0) + delta)));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      enterKeyHint="done"
      disabled={disabled}
      aria-label={label}
      value={value === null ? "" : String(value)}
      onChange={(e) => commit(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          step(1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          step(-1);
        }
      }}
      // 44px square: the minimum comfortable touch target (§8).
      className={cn(
        "size-11 shrink-0 rounded-xl border-2 text-center text-xl font-semibold",
        "focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2 focus-visible:outline-none",
        // A disabled box is *locked*, not broken. Fading it to 40% made a
        // signed-out visitor read the whole row as a rendering fault; keeping
        // it fully drawn and merely inert reads as "sign in to use this",
        // which is what the padlock between the boxes then confirms.
        // pointer-events-none matters more than it looks: a disabled input
        // swallows the click without bubbling, so without it a tap on a
        // padlocked box would never reach the sign-in link wrapping it.
        "disabled:text-muted-foreground disabled:pointer-events-none",
        // An empty box needs a surface of its own. Transparent-on-dark-card
        // left the control reading as blank space with a chip floating in it.
        filled
          ? "border-primary/60 bg-primary/15 backdrop-blur-md"
          : "border-white/20 bg-background/30 backdrop-blur-md",
        // The winning side of a filled-in prediction, so the called outcome is
        // visible without reading both digits.
        highlight && "border-primary bg-primary/20",
        // A symmetric curve rather than `ease-out`: nothing is entering or
        // leaving here, it is one colour becoming another.
        "transition-colors duration-150 ease-tint",
        className
      )}
      data-numeric
    />
  );
}

/**
 * The solid block between the two score boxes.
 *
 * The reference design puts a filled button there, and it is the single
 * strongest thing on the row: it is what tells you at a glance that this row
 * wants something from you, before you have read a word. Ours carries the
 * starball rather than a label, because at 32px between two 44px boxes there is
 * no width for a word that also has to survive translation.
 *
 * It turns into a padlock when the boxes either side of it cannot be filled —
 * signed out, or the fixture has kicked off.
 */
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
          : // An opaque, restrained gold tile. The short vertical gradient,
            // top glint, and darker lower inset give it physical depth without
            // turning a repeated control into a glossy animated ornament.
            "border-y border-pick-shadow/80 bg-[linear-gradient(180deg,var(--pick-highlight)_0%,var(--pick)_48%,var(--pick-shadow)_100%)] text-pick-foreground [text-shadow:0_1px_0_rgb(255_255_255/0.28)] shadow-[inset_0_1px_0_rgb(255_255_255/0.58),inset_0_-2px_0_rgb(88_54_8/0.34),0_3px_8px_rgb(8_4_24/0.34)]",
        className
      )}
      aria-hidden="true"
    >
      {locked ? (
        <Lock className="size-3.5" />
      ) : (
        label
      )}
    </span>
  );
}
