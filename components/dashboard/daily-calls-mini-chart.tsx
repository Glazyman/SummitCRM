'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Point { label: string; full: string; value: number }

/**
 * Mini bar chart of UNIQUE leads called per day — the 21st.dev "mini-chart"
 * look (custom div bars, hover highlight + neighbour dimming, animated heights)
 * wired to our own data (GET /api/analytics/calls-7d, which scopes a rep to
 * their own activity and an admin to the workspace). Uses `leads_called`
 * (DISTINCT lead per day) to match the per-person framing of the analytics
 * page rather than raw call volume.
 *
 * When `start`/`end` are passed the chart honours that exact range (so its bars
 * reconcile with the Call Summary total on the same page); otherwise it falls
 * back to the last 7 days.
 */
export function DailyCallsMiniChart({
  start, end, className,
}: { start?: string; end?: string; className?: string }) {
  const [data,    setData]    = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [hover,   setHover]   = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const qs = new URLSearchParams()
    if (start) qs.set('start', start)
    if (end)   qs.set('end', end)
    const url = `/api/analytics/calls-7d${qs.toString() ? `?${qs}` : ''}`

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return
        const series = (j.series ?? []) as Array<{ date: string; calls?: number; leads_called?: number }>
        const many   = series.length > 8
        const pts = series.map((s) => {
          const d = new Date(`${s.date}T00:00:00`)
          return {
            label: many
              ? d.toLocaleDateString('en-US', { day: 'numeric' })
              : d.toLocaleDateString('en-US', { weekday: 'short' }),
            full: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: Number(s.leads_called ?? 0),
          }
        })
        setData(pts)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [start, end])

  const max     = Math.max(...data.map((d) => d.value), 1)
  const total   = data.reduce((s, d) => s + d.value, 0)
  const active  = hover != null ? data[hover] : null
  const n       = data.length
  const many    = n > 8
  // keep labels legible when there are lots of bars
  const labelEvery = many ? Math.ceil(n / 6) : 1

  return (
    <div className={cn('rounded-xl border bg-card p-5', className)}>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Leads Called {n <= 1 ? 'today' : `· ${n} days`}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {active ? active.value : total}
            <span className="ml-1.5 text-xs font-medium text-muted-foreground">
              {active ? active.full : 'total'}
            </span>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : data.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">No call data.</div>
      ) : (
        <div className={cn('flex h-24 items-end', many ? 'gap-[3px]' : 'gap-2')}>
          {data.map((d, i) => {
            const h          = (d.value / max) * 96
            const isHover    = hover === i
            const isNeighbor = hover != null && Math.abs(hover - i) === 1
            const showLabel  = isHover || i % labelEvery === 0
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
                <span className={cn('h-3 text-[10px] leading-3 transition-colors', isHover ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {showLabel ? d.label : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
