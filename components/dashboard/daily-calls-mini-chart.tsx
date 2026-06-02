'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Point { label: string; value: number }

/**
 * Mini bar chart of UNIQUE leads called over the last 7 days — the 21st.dev
 * "mini-chart" look (custom div bars, hover highlight + neighbour dimming,
 * animated heights) wired to our own data (GET /api/analytics/calls-7d,
 * which scopes a rep to their own activity and an admin to the workspace).
 * Uses `leads_called` (DISTINCT lead per day) to match the per-person framing
 * of the analytics page rather than raw call volume.
 */
export function DailyCallsMiniChart({ className }: { className?: string }) {
  const [data,    setData]    = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [hover,   setHover]   = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/analytics/calls-7d')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return
        const series = (j.series ?? []) as Array<{ date: string; calls?: number; leads_called?: number }>
        const pts = series.slice(-7).map((s) => ({
          label: new Date(s.date).toLocaleDateString('en-US', { weekday: 'short' }),
          value: Number(s.leads_called ?? 0),
        }))
        setData(pts)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  const max    = Math.max(...data.map((d) => d.value), 1)
  const total  = data.reduce((s, d) => s + d.value, 0)
  const active = hover != null ? data[hover] : null

  return (
    <div className={cn('rounded-xl border bg-card p-5', className)}>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-sm font-semibold">Leads called · last 7 days</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums">
            {active ? active.value : total}
            <span className="ml-1.5 text-xs font-medium text-muted-foreground">
              {active ? active.label : 'total'}
            </span>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="flex h-24 items-end gap-2">
          {data.map((d, i) => {
            const h          = (d.value / max) * 96
            const isHover    = hover === i
            const isNeighbor = hover != null && Math.abs(hover - i) === 1
            return (
              <button
                type="button"
                key={i}
                className="group flex flex-1 flex-col items-center justify-end gap-1.5"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <div
                  className={cn(
                    'w-full rounded-md transition-all duration-200',
                    isHover ? 'bg-primary' : isNeighbor ? 'bg-primary/40' : 'bg-primary/20',
                  )}
                  style={{ height: `${Math.max(h, 4)}px` }}
                />
                <span className={cn('text-[10px] transition-colors', isHover ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {d.label}
                </span>
              </button>
            )
          })}
          {data.length === 0 && (
            <p className="w-full text-center text-sm text-muted-foreground">No call data.</p>
          )}
        </div>
      )}
    </div>
  )
}
