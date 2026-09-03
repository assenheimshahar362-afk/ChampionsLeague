export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only fixed start-4 top-4 z-[100] rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-xl outline-none ring-3 ring-background focus-visible:ring-ring"
    >
      {label}
    </a>
  );
}
