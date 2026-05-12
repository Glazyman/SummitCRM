/**
 * Shown instantly during navigation to /dashboard. Mirrors the real
 * page layout so the user sees structure (not a blank screen) while
 * the server component fetches metrics in the background.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 rounded-md bg-muted" />
        <div className="h-8 w-24 rounded-md bg-muted" />
      </div>

      {/* 4 stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Rep performance panel placeholder */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-7 w-20 rounded-lg bg-muted" />
            <div className="h-7 w-36 rounded-lg bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border">
          <div className="p-5">
            <div className="h-3 w-24 rounded bg-muted mb-3" />
            <div className="h-[200px] rounded bg-muted/60" />
          </div>
          <div className="p-5">
            <div className="h-3 w-24 rounded bg-muted mb-3" />
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-20 rounded bg-muted" />
                  <div className="h-5 w-full rounded-full bg-muted/60" />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Table skeleton */}
        <div className="px-5 py-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-7 w-7 rounded-full bg-muted shrink-0" />
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="flex-1" />
              <div className="h-4 w-16 rounded bg-muted" />
              <div className="h-4 w-12 rounded bg-muted" />
              <div className="h-4 w-12 rounded bg-muted" />
              <div className="h-4 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* Overdue follow-ups widget placeholder */}
      <div className="rounded-2xl border border-border bg-card shadow-card p-5">
        <div className="h-4 w-40 rounded bg-muted mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-7 w-7 rounded-lg bg-muted" />
      </div>
      <div className="h-8 w-24 rounded bg-muted" />
      <div className="h-3 w-28 rounded bg-muted/70" />
    </div>
  )
}
