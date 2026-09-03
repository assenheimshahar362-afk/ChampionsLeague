"use client";

import Image from "next/image";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Chrome fires this instead of showing its own install UI once
 * `preventDefault()` is called on it. Not in lib.dom, so it is declared here.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = "alufot:install-dismissed-at";

/**
 * How long a "not now" lasts.
 *
 * Permanent would be safer for the user and worse for them: people decline on
 * a train and would have no way back short of the browser menu. A season is
 * eight months, so asking twice across one is not nagging.
 */
const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Long enough that the sheet is never part of the first paint. Someone who
 * followed a fixture link came to read a fixture, and answering a question
 * about installation before the page has settled is how prompts get dismissed
 * reflexively.
 */
const SHOW_DELAY_MS = 4000;

function readDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return null;
    const at = Number.parseInt(raw, 10);
    return Number.isFinite(at) ? at : null;
  } catch {
    // Private mode, or storage blocked entirely. Treat as never dismissed —
    // the sheet is dismissible either way.
    return null;
  }
}

function recordDismissal() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Nothing to fall back to. The sheet still closes for this session.
  }
}

/** Standalone means it is already installed and running as the app. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS never adopted display-mode for home-screen launches.
    ("standalone" in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true)
  );
}

/**
 * iOS has no beforeinstallprompt — on any iPhone browser, installing means the
 * user doing it by hand through the share sheet. Detected by platform rather
 * than by user-agent string parsing: iPadOS reports itself as a Mac, and the
 * touch-point count is what separates the two.
 */
function isIOS(): boolean {
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

export function InstallPrompt() {
  const t = useTranslations("install");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissedAt = readDismissedAt();
    if (dismissedAt && Date.now() - dismissedAt < DISMISSAL_TTL_MS) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const ios = isIOS();

    // Every state update below happens in a callback rather than in the effect
    // body — setting state synchronously here would render twice before the
    // sheet has any reason to exist.
    const reveal = () => {
      setShowIOSHelp(ios);
      setVisible(true);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppresses Chrome's own mini-infobar, which is what hands us the right
      // to show this sheet instead. The event is only useful while held.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      timer = setTimeout(reveal, SHOW_DELAY_MS);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      recordDismissal();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS gets the same sheet with instructions instead of a button, because
    // there is no event to wait for and nothing to call. Mutually exclusive
    // with the branch above: Safari never fires beforeinstallprompt.
    if (ios) timer = setTimeout(reveal, SHOW_DELAY_MS);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    recordDismissal();
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    // Hide first: the browser's own dialog takes over from here, and leaving
    // the sheet behind it means it is still there when the dialog closes.
    setVisible(false);
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A single prompt event can only be used once.
    setDeferred(null);
    if (outcome === "dismissed") recordDismissal();
  }, [deferred]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-prompt-title"
      className="enter-sheet fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 px-4 md:bottom-4 md:inset-x-auto md:end-4 md:w-90"
    >
      <div className="bg-popover/95 ring-border mx-auto flex max-w-sm flex-col gap-3 rounded-2xl p-4 shadow-2xl ring-1 backdrop-blur-md md:max-w-none">
        <div className="flex items-start gap-3">
          <Image
            src="/logo.webp"
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p id="install-prompt-title" className="font-semibold">
              {t("title")}
            </p>
            <p className="text-muted-foreground text-sm text-pretty">
              {t("body")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            aria-label={t("dismiss")}
            className="-me-1 -mt-1 shrink-0"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        {showIOSHelp ? (
          /* No button: on iOS the browser will not surface an install prompt
             on request, so the only honest thing to show is where the control
             actually lives. */
          <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
            {t.rich("stepsIOS", {
              share: () => (
                <Share className="text-foreground inline size-4" aria-hidden="true" />
              ),
              add: () => (
                <SquarePlus
                  className="text-foreground inline size-4"
                  aria-hidden="true"
                />
              ),
            })}
          </p>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={install}>
              <Download aria-hidden="true" />
              {t("action")}
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {t("notNow")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
