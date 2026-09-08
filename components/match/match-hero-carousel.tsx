"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type SwipeStart = {
  pointerId: number;
  x: number;
  y: number;
  startedAt: number;
};

export function MatchHeroCarousel({
  children,
  direction,
  previousHref,
  nextHref,
  previousLabel,
  nextLabel,
  currentPosition,
  total,
}: {
  children: ReactNode;
  direction: "ltr" | "rtl";
  previousHref: string | null;
  nextHref: string | null;
  previousLabel: string;
  nextLabel: string;
  currentPosition: number;
  total: number;
}) {
  const router = useRouter();
  const swipeStart = useRef<SwipeStart | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      event.pointerType !== "touch" ||
      swipeStart.current ||
      (event.target as HTMLElement).closest(
        "a, button, input, select, textarea, [role='button']"
      )
    ) {
      return;
    }

    swipeStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function clearSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (swipeStart.current?.pointerId === event.pointerId) {
      swipeStart.current = null;
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    clearSwipe(event);
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const elapsed = Math.max(1, performance.now() - start.startedAt);
    const horizontal = Math.abs(deltaX);

    // A deliberate horizontal gesture can be either long or quick. Requiring
    // horizontal dominance keeps ordinary vertical page scrolling inert.
    if (
      horizontal <= Math.abs(deltaY) * 1.25 ||
      (horizontal < 52 && horizontal / elapsed < 0.35)
    ) {
      return;
    }

    const swipedTowardNext = direction === "rtl" ? deltaX > 0 : deltaX < 0;
    const href = swipedTowardNext ? nextHref : previousHref;
    if (href) router.push(href);
  }

  return (
    <div
      className="relative mt-4 touch-pan-y"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearSwipe}
      onLostPointerCapture={clearSwipe}
    >
      {children}
      <nav
        aria-label={`${previousLabel} / ${nextLabel}`}
        className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-5"
      >
        <CarouselArrow href={previousHref} label={previousLabel}>
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </CarouselArrow>
        <span
          dir="ltr"
          className="text-muted-foreground min-w-14 text-center text-xs font-semibold tabular-nums"
        >
          {currentPosition} / {total}
        </span>
        <CarouselArrow href={nextHref} label={nextLabel}>
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </CarouselArrow>
      </nav>
    </div>
  );
}

function CarouselArrow({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
}) {
  const className = cn(
    "text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
    "motion-safe:transition-[color,background-color,transform] motion-safe:duration-150",
    href
      ? "hover:bg-accent hover:text-foreground active:scale-95"
      : "cursor-default opacity-30"
  );

  if (!href) {
    return (
      <span aria-hidden="true" className={className}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={className}
    >
      {children}
    </Link>
  );
}
