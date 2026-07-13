/**
 * Group-level fallback for the dashboard. Shown instantly during navigation to
 * any dashboard route that doesn't ship its own loading.tsx (analytics,
 * documents, tasks, admin, batches, callbacks, notifications, settings/*, …),
 * so a click never leaves the previous page frozen while the server renders.
 * Routes with a tailored skeleton (leads, pipeline, dashboard) override this.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      {/* Title + actions row */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-md bg-muted" />
          <div className="h-4 w-64 rounded bg-muted/70" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-md bg-muted" />
          <div className="h-9 w-24 rounded-md bg-muted" />
        </div>
      </div>

      {/* Stat / summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-5">
            <div className="h-3 w-20 rounded bg-muted/70" />
            <div className="mt-3 h-8 w-24 rounded-md bg-muted" />
            <div className="mt-2 h-3 w-28 rounded bg-muted/70" />
          </div>
        ))}
      </div>

      {/* Main content block */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-muted/40">
          <div className="h-3 w-24 rounded bg-muted-foreground/20" />
          <div className="h-3 w-32 rounded bg-muted-foreground/20" />
          <div className="flex-1" />
          <div className="h-3 w-16 rounded bg-muted-foreground/20" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="flex-1" />
            <div className="h-6 w-20 rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
