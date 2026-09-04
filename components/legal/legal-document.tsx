import { FileText } from "lucide-react";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export function LegalDocument({
  title,
  description,
  updated,
  sections,
}: {
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20">
      <article className="mt-8 overflow-hidden rounded-2xl border border-white/15 bg-card/55 shadow-[0_20px_60px_rgb(3_7_25/0.28)] backdrop-blur-xl">
        <header className="relative isolate overflow-hidden border-b border-white/10 px-5 py-6 sm:px-7">
          <span aria-hidden="true" className="from-primary/18 via-primary/[0.05] absolute inset-0 -z-10 bg-gradient-to-br to-transparent" />
          <div className="flex items-center gap-2 text-xs font-semibold text-floodlight uppercase">
            <FileText className="size-4" aria-hidden="true" />
            SA Software Solutions
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{title}</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">{description}</p>
          <p className="text-muted-foreground mt-3 text-xs">{updated}</p>
        </header>

        <div className="divide-y divide-foreground/10 px-5 sm:px-7">
          {sections.map((section) => (
            <section key={section.title} className="py-6">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="text-muted-foreground mt-3 space-y-3 text-sm leading-7 sm:text-base">
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.items ? (
                  <ul className="list-disc space-y-2 ps-5 marker:text-primary">
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}