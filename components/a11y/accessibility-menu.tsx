"use client";

import {
  Accessibility,
  Contrast,
  Minus,
  Pause,
  Plus,
  RotateCcw,
  Underline,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useCallback, useState, type ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "alufot.a11y-prefs";

type FontScale = "md" | "lg" | "xl";

type AccessibilityPreferences = {
  fontScale: FontScale;
  contrast: boolean;
  underlineLinks: boolean;
  reduceMotion: boolean;
};

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  fontScale: "md",
  contrast: false,
  underlineLinks: false,
  reduceMotion: false,
};

function applyPreferences(preferences: AccessibilityPreferences) {
  const root = document.documentElement;
  root.dataset.a11yFontScale = preferences.fontScale;
  root.dataset.a11yContrast = String(preferences.contrast);
  root.dataset.a11yUnderlineLinks = String(preferences.underlineLinks);
  root.dataset.a11yMotion = preferences.reduceMotion ? "reduce" : "no-preference";
}

function loadPreferences(): AccessibilityPreferences {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(saved) as Partial<AccessibilityPreferences>;
    return {
      fontScale: ["md", "lg", "xl"].includes(parsed.fontScale ?? "")
        ? (parsed.fontScale as FontScale)
        : DEFAULT_PREFERENCES.fontScale,
      contrast: Boolean(parsed.contrast),
      underlineLinks: Boolean(parsed.underlineLinks),
      reduceMotion: Boolean(parsed.reduceMotion),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function AccessibilityMenu() {
  const t = useTranslations("a11yMenu");
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  const updatePreferences = useCallback(
    (updates: Partial<AccessibilityPreferences>) => {
      setPreferences((current) => {
        const next = { ...current, ...updates };
        applyPreferences(next);

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // The settings remain active for this visit when storage is blocked.
        }

        return next;
      });
    },
    []
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setPreferences(loadPreferences());
        setOpen(nextOpen);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={t("title")}
          className={cn(
            "fixed start-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex size-12 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground shadow-[0_12px_32px_rgb(0_0_0/0.4)] ring-1 ring-white/20",
            "transition-[background-color,transform] duration-150 outline-none hover:bg-primary/85 active:scale-[0.96]",
            "focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-3 focus-visible:ring-offset-background md:bottom-5"
          )}
        >
          <Accessibility className="size-6" aria-hidden="true" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-60 bg-black/60 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed start-4 bottom-[calc(8.25rem+env(safe-area-inset-bottom))] z-70 w-80 max-w-[calc(100vw-2rem)]",
            "max-h-[calc(100dvh-9.25rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/20 bg-popover p-4 text-popover-foreground shadow-2xl",
            "outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 md:bottom-[4.25rem] md:max-h-[calc(100dvh-5.25rem)]"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-bold">{t("title")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("description")}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t("close")}
              className="-me-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="mt-4 space-y-2.5">
            <fieldset className="rounded-xl border border-white/15 p-3">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">
                {t("textSize")}
              </legend>
              <div className="flex items-center gap-2">
                <StepperButton
                  label={t("decreaseText")}
                  disabled={preferences.fontScale === "md"}
                  onClick={() =>
                    updatePreferences({
                      fontScale: preferences.fontScale === "xl" ? "lg" : "md",
                    })
                  }
                >
                  <Minus className="size-4" aria-hidden="true" />
                </StepperButton>
                <output
                  aria-live="polite"
                  className="flex-1 text-center text-sm font-semibold text-muted-foreground"
                >
                  {{ md: "100%", lg: "112%", xl: "125%" }[preferences.fontScale]}
                </output>
                <StepperButton
                  label={t("increaseText")}
                  disabled={preferences.fontScale === "xl"}
                  onClick={() =>
                    updatePreferences({
                      fontScale: preferences.fontScale === "md" ? "lg" : "xl",
                    })
                  }
                >
                  <Plus className="size-4" aria-hidden="true" />
                </StepperButton>
              </div>
            </fieldset>

            <MenuToggle
              label={t("highContrast")}
              icon={<Contrast className="size-4" aria-hidden="true" />}
              pressed={preferences.contrast}
              onClick={() => updatePreferences({ contrast: !preferences.contrast })}
            />
            <MenuToggle
              label={t("underlineLinks")}
              icon={<Underline className="size-4" aria-hidden="true" />}
              pressed={preferences.underlineLinks}
              onClick={() =>
                updatePreferences({ underlineLinks: !preferences.underlineLinks })
              }
            />
            <MenuToggle
              label={t("reduceMotion")}
              icon={<Pause className="size-4" aria-hidden="true" />}
              pressed={preferences.reduceMotion}
              onClick={() => updatePreferences({ reduceMotion: !preferences.reduceMotion })}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-3">
            <button
              type="button"
              onClick={() => updatePreferences(DEFAULT_PREFERENCES)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {t("reset")}
            </button>
            <Link
              href="/accessibility"
              className="flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-primary underline underline-offset-4 outline-none hover:text-primary/80 focus-visible:ring-3 focus-visible:ring-ring"
            >
              {t("statement")}
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MenuToggle({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-medium outline-none transition-colors",
        "focus-visible:ring-3 focus-visible:ring-ring",
        pressed
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-white/15 bg-background/35 text-foreground hover:bg-muted/70"
      )}
    >
      {icon}
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "ms-auto size-2.5 rounded-full ring-1 ring-white/20",
          pressed ? "bg-primary" : "bg-muted-foreground/40"
        )}
      />
    </button>
  );
}

function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-lg border border-white/15 bg-background/35 outline-none hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-3 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}
