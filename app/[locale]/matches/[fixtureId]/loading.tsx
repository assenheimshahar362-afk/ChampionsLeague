export default function MatchDetailsLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-8">
      <div className="bg-card/45 h-5 w-32 animate-pulse rounded-md" />
      <div className="bg-card/55 mt-5 h-72 animate-pulse rounded-[2rem] border border-white/15" />
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="bg-card/55 h-96 animate-pulse rounded-2xl border border-white/15" />
        <div className="bg-card/55 h-72 animate-pulse rounded-2xl border border-white/15" />
      </div>
    </main>
  );
}
