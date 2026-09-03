export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-5xl flex-1 px-4 py-6"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="motion-safe:animate-pulse">
        <div className="bg-muted/70 h-3 w-24 rounded" />
        <div className="bg-muted mt-3 h-8 w-64 max-w-[75vw] rounded-md" />
        <div className="bg-muted/70 mt-3 h-4 w-96 max-w-full rounded" />

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="border-border/70 bg-card/55 h-24 rounded-lg border"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
