"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function ConfirmActionButton({
  label,
  confirmation,
  disabled = false,
  destructive = false,
}: {
  label: string;
  confirmation: string;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant={destructive ? "destructive" : "default"}
      disabled={disabled || pending}
      onClick={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      {pending ? "…" : label}
    </Button>
  );
}

export function ConfirmDeleteButton({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations("admin");
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon-sm"
      disabled={disabled || pending}
      title={t("delete")}
      onClick={(event) => {
        if (!window.confirm(t("confirmDelete"))) event.preventDefault();
      }}
    >
      <Trash2 />
      <span className="sr-only">{t("delete")}</span>
    </Button>
  );
}
