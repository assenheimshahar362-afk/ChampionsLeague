"use client";

import { useLocale } from "next-intl";
import { useId } from "react";

function scriptValue(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function LocalKickoff({
  iso,
  dateStyle = "full",
}: {
  iso: string;
  dateStyle?: "full" | "compact" | "time";
}) {
  const locale = useLocale();
  const id = useId();
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    weekday: dateStyle === "full" ? "long" : undefined,
    day: dateStyle === "time" ? undefined : "numeric",
    month:
      dateStyle === "time" ? undefined : dateStyle === "full" ? "long" : "short",
    year: dateStyle === "full" ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  const value = new Intl.DateTimeFormat(locale, options).format(date);
  const browserFormatScript = `{var n=document.getElementById(${scriptValue(id)});if(n)n.textContent=new Intl.DateTimeFormat(${scriptValue(locale)},${scriptValue(options)}).format(new Date(${scriptValue(iso)}))}`;

  return (
    <>
      <time id={id} dateTime={iso} suppressHydrationWarning data-numeric>
        {value}
      </time>
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: browserFormatScript }}
      />
    </>
  );
}
