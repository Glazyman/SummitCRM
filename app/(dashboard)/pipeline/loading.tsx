/** Instant skeleton for /pipeline navigation. */
export default function PipelineLoading() {
  return (
    <div className="flex flex-col min-h-screen p-6 animate-pulse">
      <div className="h-7 w-40 rounded-md bg-muted mb-5" />

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="h-9 w-64 rounded-xl bg-muted" />
        <div className="h-9 w-24 rounded-lg bg-muted" />
        <div className="h-9 w-20 rounded-lg bg-muted" />
        <div className="flex-1" />
        <div className="h-9 w-28 rounded-lg bg-muted" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-8 w-16 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted/60" />
          </div>
        ))}
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[300px] shrink-0 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-muted" />
                <div className="h-4 w-24 rounded bg-muted" />
              </div>
              <div className="h-3 w-12 rounded bg-muted" />
            </div>
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-2.5 w-32 rounded bg-muted/60" />
                  </div>
                </div>
                <div className="h-6 w-20 rounded-md bg-muted/60" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
