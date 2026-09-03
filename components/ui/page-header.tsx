import * as React from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  prominent?: boolean;
};

/**
 * A compact glass banner that keeps page identity readable over the stadium.
 * It is intentionally lighter than a form surface so content hierarchy stays
 * clear: this announces the page; the heavier panels below hold the work.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  prominent = false,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "bg-surface/70 relative isolate overflow-hidden rounded-2xl border border-white/15 px-5 py-4 backdrop-blur-xl sm:px-6 sm:py-5",
        "shadow-[0_14px_38px_rgb(3_7_25/0.24),inset_0_1px_0_rgb(255_255_255/0.04)]",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="from-primary/18 via-primary/[0.05] absolute inset-0 -z-10 bg-gradient-to-br to-transparent"
      />
      <span
        aria-hidden="true"
        className="via-floodlight/70 absolute inset-y-0 start-0 w-px bg-gradient-to-b from-transparent to-transparent"
      />

      {eyebrow ? (
        <div className="text-floodlight flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] uppercase">
          {eyebrow}
        </div>
      ) : null}

      <h1
        className={cn(
          "font-semibold tracking-tight text-balance",
          eyebrow && "mt-2",
          prominent ? "text-3xl" : "text-2xl"
        )}
      >
        {title}
      </h1>

      {description ? (
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm text-pretty">
          {description}
        </p>
      ) : null}
    </header>
  );
}
