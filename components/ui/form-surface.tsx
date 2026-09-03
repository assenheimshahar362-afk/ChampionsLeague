import * as React from "react";
import type { ClassValue } from "clsx";

import { cn } from "@/lib/utils";

/**
 * A translucent, bordered surface for areas that ask the user for input.
 *
 * It borrows the hero's glass-on-stadium treatment while keeping enough
 * contrast behind labels and controls for longer forms.
 */
export function formSurfaceStyles(...className: ClassValue[]) {
  return cn(
    "border-white/15 bg-gradient-to-b from-card/75 to-surface/55 rounded-2xl border backdrop-blur-xl",
    "shadow-[0_18px_48px_rgb(3_7_25/0.28),inset_0_1px_0_rgb(255_255_255/0.04)]",
    className
  );
}

export function FormSurface({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-surface"
      className={formSurfaceStyles(className)}
      {...props}
    />
  );
}
