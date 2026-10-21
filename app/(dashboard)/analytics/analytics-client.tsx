'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { RepPerformanceTable } from '@/components/analytics/rep-performance-table'
import { AnalyticsExportButton } from '@/components/analytics/analytics-export-button'
import type { RepRow, CallOverview, AnalyticsTab } from '@/components/analytics/types'
import type { ActivityDay } from '@/components/analytics/activity-insights'
import { resolveDateRange } from '@/lib/date-ranges'
import { DateRangePicker } from '@/components/admin/date-range-picker'
import type { DateRangePreset } from '@/components/admin/types'
import { Button }  from '@/components/ui/button'
import { RefreshCw, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dayLabel, todayYmd } from '@/components/ui/day-nav'

const OverviewCards = dynamic(() => import('@/components/analytics/overview-cards').then(m => m.OverviewCards), { loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" /> })
const ActivityInsights = dynamic(() => import('@/components/analytics/activity-insights').then(m => m.ActivityInsights), { loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" /> })

interface TabConfig { id: AnalyticsTab; label: string; minRole: string }

const TABS: TabConfig[] = [
  { id: 'overview', label: 'Overview',         minRole: 'rep'   },
  { id: 'reps',     label: 'Rep Performance',  minRole: 'admin' },
]

const ROLE_RANK: Record<string, number> = { rep: 1, admin: 2, super_admin: 3 }
function canSee(tabRole: string, userRole: string) {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[tabRole] ?? 0)
}

const EMPTY_OVERVIEW: CallOverview = {
  total: 0, unique_leads: 0, interested: 0, not_interested: 0, bad_leads: 0,
  answered: 0, voicemail: 0, no_answer: 0, wrong_number: 0, callback: 0,
  follow_ups_due: 0, follow_ups_overdue: 0, leads_total: 0, leads_active: 0, contacted_total: 0,
}

// ── Main analytics component ──────────────────────────────────────────────
interface Props { userRole: string; userId: string }

function AnalyticsContent({ userRole }: Props) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const rawRange = searchParams.get('range')
  const range: DateRangePreset = ['today', '7d', '30d', 'all', 'day', 'custom'].includes(rawRange ?? '') ? rawRange as DateRangePreset : '30d'
  // "Pick day" — a single local calendar day, kept in the URL so it survives refresh.
  const rawDay = searchParams.get('day') ?? ''
  const day = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) && !isNaN(Date.parse(rawDay)) ? rawDay : todayYmd()
  const tabParam     = searchParams.get('tab') as AnalyticsTab ?? 'overview'

  const isRep   = userRole === 'rep'
  const isAdmin = ['admin', 'super_admin'].includes(userRole)

  const visibleTabs = TABS.filter(t => canSee(t.minRole, userRole))
  const activeTab   = visibleTabs.find(t => t.id === tabParam) ? tabParam : visibleTabs[0]?.id ?? 'overview'

  const from = searchParams.get('from') ?? ''
  const through = searchParams.get('through') ?? ''
  const { start, end } = React.useMemo(() => resolveDateRange(range, day, from, through), [range, day, from, through])
  const [historyStart, setHistoryStart] = useState<string>()

  const [overview,  setOverview]  = useState<CallOverview>(EMPTY_OVERVIEW)
  const [reps,      setReps]      = useState<RepRow[]>([])

  const [daily, setDaily] = useState<ActivityDay[]>([])
  const [error, setError] = useState<string | null>(null)
  const requestId = React.useRef(0)
  const [loadingReps, setLR] = useState(true)

  const responseCache = React.useRef(new Map<string, { at: number; request: Promise<{ reps: RepRow[]; overview: CallOverview; daily: ActivityDay[]; historyStart?: string }> }>())
  const fetchReps = useCallback(async (force = false) => {
    if (!isAdmin) return
    const request = ++requestId.current
    setLR(true)
    setError(null)
    try {
      const params = new URLSearchParams({ start, end, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
      const key = params.toString()
      let cached = responseCache.current.get(key)
      if (force || !cached || Date.now() - cached.at > 15_000) {
        const pending = fetch(`/api/analytics/reps?${params}`).then(async res => {
          const result = await res.json()
          if (!res.ok) throw new Error(result.error || 'Unable to load analytics')
          return result
        })
        cached = { at: Date.now(), request: pending }
        responseCache.current.set(key, cached)
        if (responseCache.current.size > 8) responseCache.current.delete(responseCache.current.keys().next().value!)
        pending.catch(() => { if (responseCache.current.get(key)?.request === pending) responseCache.current.delete(key) })
      }
      const data = await cached.request
      if (request !== requestId.current) return
      setReps(data.reps ?? [])
      setOverview(data.overview ?? EMPTY_OVERVIEW)
      setDaily(data.daily ?? [])
      setHistoryStart(data.historyStart)
    } catch (err) {
      if (request === requestId.current) setError(err instanceof Error ? err.message : 'Unable to load analytics')
    } finally { if (request === requestId.current) setLR(false) }
  }, [start, end, isAdmin])

  useEffect(() => {
    // Start an external data request whenever the selected period changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchReps()
    const counter = requestId
    return () => { counter.current++ }
  }, [fetchReps])

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set(key, value)
    window.history.replaceState(null, '', `${pathname}?${p.toString()}`)
  }
  const setDay = (ymd: string) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set('range', 'day')
    p.set('day', ymd)
    window.history.replaceState(null, '', `${pathname}?${p.toString()}`)
  }

  const setCustomRange = (first: string, last: string) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set('range', 'custom'); p.set('from', first); p.set('through', last)
    window.history.replaceState(null, '', `${pathname}?${p}`)
  }

  const isLoading = loadingReps

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="w-full">
          <div className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <BarChart2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">{isRep ? 'My Analytics' : 'Team Analytics'}</h1>
                <p className="text-xs text-muted-foreground">
                  {loadingReps ? 'Loading analytics…' : error ? 'Data unavailable' : `${range === 'day' ? dayLabel(day) + ' · ' : ''}${reps.length} contributors · ${overview.unique_leads.toLocaleString()} leads called`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <AnalyticsExportButton view={activeTab} start={start} end={end} />
              <Button variant="outline" size="sm" onClick={() => { void fetchReps(true) }}
                disabled={isLoading} className="gap-1.5 h-9">
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
          {/* Own row at every width — with "Pick day" open the controls are too
              wide to share the title row. */}
          <div className="pb-3">
            <DateRangePicker value={range} onChange={v => setParam('range', v)} day={day} onDayChange={setDay} start={start} end={end} historyStart={loadingReps ? undefined : historyStart} onRangeChange={setCustomRange} className="w-full md:w-auto" />
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-0 -mb-px overflow-x-auto">
            {visibleTabs.map(tab => (
              <button key={tab.id} onClick={() => setParam('tab', tab.id)}
                className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full py-6 space-y-6">
        {error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm"><p>{error}</p><button type="button" className="mt-2 underline" onClick={() => void fetchReps(true)}>Try again</button></div> : activeTab === 'overview' && <>
          <ActivityInsights overview={overview} reps={reps} daily={daily} loading={loadingReps} />
          <OverviewCards overview={overview} loading={loadingReps} reps={reps} />
        </>}

        {!error && activeTab === 'reps' && isAdmin && (
          <RepPerformanceTable overview={overview} reps={reps} loading={loadingReps} start={start} end={end} />
        )}

      </div>
    </div>
  )
}

export function AnalyticsClient(props: Props) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading analytics…
      </div>
    }>
      <AnalyticsContent {...props} />
    </Suspense>
  )
}
