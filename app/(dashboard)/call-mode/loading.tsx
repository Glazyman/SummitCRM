/**
 * Tailored skeleton for /call-mode — overrides the group-level catch-all
 * (app/(dashboard)/loading.tsx), whose stat-cards-plus-table shape is a leads
 * page and looks nothing like this one.
 *
 * Mirrors the setup screen in call-mode-client.tsx: centered max-w-2xl column,
 * round icon + title + subtitle, then one card holding the target bar, the
 * "Who are we calling?" preset grid, and the count/Start footer.
 */
export default function CallModeLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12 animate-pulse">
      {/* Icon + title + subtitle */}
      <div className="mb-8 flex flex-col items-center">
        <div className="mb-3 h-12 w-12 rounded-full bg-muted" />
        <div className="h-8 w-40 rounded-md bg-muted" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-muted/70" />
      </div>

      {/* Setup card */}
      <div className="rounded-xl border bg-card p-5 shadow-xs shadow-black/5">
        {/* Daily-target progress */}
        <div className="mb-4 border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="h-3 w-24 rounded bg-muted/70" />
            <div className="h-3 w-16 rounded bg-muted/70" />
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-muted" />
        </div>

        {/* "Who are we calling?" + preset grid (3 presets) */}
        <div className="mb-2 h-4 w-36 rounded bg-muted/70" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-input p-3">
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="mt-1.5 h-3 w-36 max-w-full rounded bg-muted/70" />
            </div>
          ))}
        </div>

        {/* Count + Start */}
        <div className="mt-5 flex items-center justify-between border-t pt-4">
          <div className="h-4 w-40 rounded bg-muted/70" />
          <div className="h-9 w-32 rounded-md bg-muted" />
        </div>
      </div>

      {/* Shortcut hint + past-sessions link */}
      <div className="mt-4 flex justify-center">
        <div className="h-3 w-64 max-w-full rounded bg-muted/70" />
      </div>
      <div className="mt-2 flex justify-center">
        <div className="h-3 w-28 rounded bg-muted/70" />
      </div>
    </div>
  )
}
