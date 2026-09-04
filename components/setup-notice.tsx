import { getTranslations } from "next-intl/server";

/** Public-safe fallback shown instead of exposing infrastructure errors. */
export async function SetupNotice({ reason }: { reason: "schema" | "empty" }) {
  const t = await getTranslations("match.empty");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
      <div className="bg-card rounded-2xl border border-dashed p-8 text-center">
        <h1 className="text-lg font-semibold tracking-tight">
          {reason === "schema" ? t("schemaTitle") : t("title")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          {reason === "schema" ? t("schemaBody") : t("body")}
        </p>
      </div>
    </main>
  );
}
