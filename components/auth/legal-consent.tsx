"use client";

import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

export function LegalConsent({ id, describedBy }: { id: string; describedBy?: string }) {
  const t = useTranslations("auth");

  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        name="terms"
        className="mt-0.5"
        aria-describedby={describedBy}
      />
      <Label htmlFor={id} className="text-muted-foreground block text-sm leading-snug font-normal">
        {t.rich("termsLabel", {
          rules: (chunks) => <LegalLink href="/rules">{chunks}</LegalLink>,
          terms: (chunks) => <LegalLink href="/terms">{chunks}</LegalLink>,
          privacy: (chunks) => <LegalLink href="/privacy">{chunks}</LegalLink>,
        })}
      </Label>
    </div>
  );
}

function LegalLink({ href, children }: { href: "/rules" | "/terms" | "/privacy"; children: React.ReactNode }) {
  return (
    <Link href={href} target="_blank" className="text-primary underline underline-offset-4">
      {children}
    </Link>
  );
}