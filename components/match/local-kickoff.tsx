"use client";

import { useLocale } from "next-intl";

export function LocalKickoff({
  iso,
  dateStyle = "full",
}: {
  iso: string;
  dateStyle?: "full" | "compact";
}) {
  const locale = useLocale();
  const date = new Date(iso);
  const value = new Intl.DateTimeFormat(locale, {
    weekday: dateStyle === "full" ? "long" : undefined,
    day: "numeric",
    month: dateStyle === "full" ? "long" : "short",
    year: dateStyle === "full" ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

  return (
    <time dateTime={iso} suppressHydrationWarning data-numeric>
      {value}
    </time>
  );
}
