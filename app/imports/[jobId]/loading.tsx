export default function Loading() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="h-[70vh] animate-pulse rounded-xl border bg-muted/40" />
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl border bg-muted/40" />
          <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />
          <div className="h-56 animate-pulse rounded-xl border bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
