/**
 * Shown instantly during navigation to /leads. Mirrors the page's
 * toolbar + table outline so navigation never blanks the screen.
 */
export default function LeadsLoading() {
  return (
    <div className="space-y-4 p-6 animate-pulse">
      {/* Title + actions row */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 rounded-md bg-muted" />
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded-md bg-muted" />
          <div className="h-8 w-24 rounded-md bg-muted" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="h-9 w-64 rounded-lg bg-muted" />
        <div className="h-9 w-24 rounded-lg bg-muted" />
        <div className="h-9 w-28 rounded-lg bg-muted" />
        <div className="h-9 w-24 rounded-lg bg-muted" />
        <div className="flex-1" />
        <div className="h-9 w-40 rounded-lg bg-muted" />
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-muted shrink-0" />
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-muted/40">
          <div className="h-4 w-4 rounded bg-muted-foreground/20" />
          <div className="h-3 w-20 rounded bg-muted-foreground/20" />
          <div className="h-3 w-24 rounded bg-muted-foreground/20" />
          <div className="h-3 w-20 rounded bg-muted-foreground/20" />
          <div className="flex-1" />
          <div className="h-3 w-16 rounded bg-muted-foreground/20" />
          <div className="h-3 w-20 rounded bg-muted-foreground/20" />
        </div>
        {/* Rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
            <div className="h-4 w-4 rounded bg-muted shrink-0" />
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="flex-1" />
            <div className="h-6 w-20 rounded-md bg-muted" />
            <div className="h-6 w-16 rounded-md bg-muted" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-8 rounded-md bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
