import { Download, Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteOwnAccount } from "@/lib/profile/actions";

export async function AccountPrivacyActions() {
  const t = await getTranslations("profile.account");

  return (
    <section className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-foreground/10 bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold">{t("exportTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {t("exportDescription")}
        </p>
        <Button asChild variant="outline" className="mt-3">
          <a href="/api/account/export" download>
            <Download aria-hidden="true" />
            {t("exportAction")}
          </a>
        </Button>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-4">
        <h2 className="text-sm font-semibold text-destructive">{t("deleteTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {t("deleteDescription")}
        </p>
        <form action={deleteOwnAccount} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            name="confirmation"
            required
            pattern="DELETE"
            autoComplete="off"
            dir="ltr"
            placeholder="DELETE"
            aria-label={t("deleteConfirmation")}
          />
          <Button type="submit" variant="destructive">
            <Trash2 aria-hidden="true" />
            {t("deleteAction")}
          </Button>
        </form>
      </div>
    </section>
  );
}