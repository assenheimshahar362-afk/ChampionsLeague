import { getTranslations } from "next-intl/server";

/**
 * Setup notice, shown instead of a blank page or a 500.
 *
 * The two reasons need different instructions and are deliberately not merged:
 * `schema` means the migrations have never been applied, `empty` means they
 * have but the season has not been ingested. Telling someone to run the ingest
 * when the tables do not exist sends them down the wrong path.
 */
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
        {/* Commands are LTR regardless of the page direction. */}
        <pre
          dir="ltr"
          className="bg-muted text-muted-foreground mt-4 overflow-x-auto rounded-lg p-3 text-start text-xs"
        >
          <code>
            {reason === "schema"
              ? "npx supabase login\nnpx supabase link --project-ref <ref>\nnpx supabase db push"
              : "npm run ingest"}
          </code>
        </pre>
      </div>
    </main>
  );
}
