'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  RepPerformanceTable, AnalyticsExportButton,
} from '@/components/analytics'
import type { RepRow, CallOverview, AnalyticsTab } from '@/components/analytics'
import { DateRangePicker } from '@/components/admin/date-range-picker'
import { DailyCallsMiniChart } from '@/components/dashboard/daily-calls-mini-chart'
import type { DateRangePreset } from '@/components/admin/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button }  from '@/components/ui/button'
import { Badge }   from '@/components/ui/badge'
import { RefreshCw, BarChart2, Phone, Calendar, Users, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, LabelList } from 'recharts'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/pie-chart'

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
  follow_ups_due: 0, follow_ups_overdue: 0, leads_total: 0, leads_active: 0,
}

const OUTCOME_COLORS: Record<string, string> = {
  answered:  '#10b981',
  voicemail: '#a855f7',
  no_answer: '#94a3b8',
  wrong:     '#ef4444',
  callback:  '#f59e0b',
}

// ── Sized pie (21st.dev "sized pie chart" look) ───────────────────────────
// One donut: each outcome is an angular slice sized by its share of total
// calls, but each slice extends to a different OUTER radius — bigger outcomes
// read as both wider AND longer wedges. Smallest value sits closest in.
const SIZED_BASE = 50   // outer radius of the smallest slice
const SIZED_INC  = 12   // radius added per larger slice
const SIZED_HOLE = 32   // shared inner radius (the centre hole)

function SizedPie({
  data, centerValue, centerLabel,
}: {
  data: { name: string; value: number; color: string }[]
  centerValue: React.ReactNode
  centerLabel: string
}) {
  // ascending so the smallest slice has the smallest radius (the reference look)
  const sorted = [...data].sort((a, b) => a.value - b.value)
  const sum    = sorted.reduce((s, d) => s + d.value, 0) || 1
  const config = Object.fromEntries(sorted.map(d => [d.name, { label: d.name }])) as ChartConfig

  return (
    <div className="relative">
      <ChartContainer
        config={config}
        className="[&_.recharts-text]:fill-background mx-auto aspect-square w-full max-h-[210px]"
      >
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          {sorted.map((entry, index) => {
            const start = (sorted.slice(0, index).reduce((s, d) => s + d.value, 0) / sum) * 360
            const end   = (sorted.slice(0, index + 1).reduce((s, d) => s + d.value, 0) / sum) * 360
            return (
              <Pie
                key={entry.name}
                data={[entry]}
                dataKey="value"
                nameKey="name"
                innerRadius={SIZED_HOLE}
                outerRadius={SIZED_BASE + index * SIZED_INC}
                cornerRadius={4}
                startAngle={start}
                endAngle={end}
              >
                <Cell fill={entry.color} />
                <LabelList
                  dataKey="value"
                  stroke="none"
                  fontSize={11}
                  fontWeight={600}
                  fill="currentColor"
                  formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')}
                />
              </Pie>
            )
          })}
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold leading-none">{centerValue}</span>
        <span className="mt-0.5 text-[10px] text-muted-foreground text-center px-2 leading-tight">{centerLabel}</span>
      </div>
    </div>
  )
}

// ── Overview summary cards ────────────────────────────────────────────────
function OverviewCards({ overview, loading, start, end }: { overview: CallOverview; loading: boolean; start: string; end: string }) {
  const answerRate = overview.total > 0 ? Math.round(overview.answered / overview.total * 100) : 0
  const donutData = [
    { name: 'Answered',  value: overview.answered,     color: OUTCOME_COLORS.answered  },
    { name: 'Voicemail', value: overview.voicemail,    color: OUTCOME_COLORS.voicemail },
    { name: 'No Answer', value: overview.no_answer,    color: OUTCOME_COLORS.no_answer },
    { name: 'Wrong #',   value: overview.wrong_number, color: OUTCOME_COLORS.wrong     },
    { name: 'Callback',  value: overview.callback,     color: OUTCOME_COLORS.callback  },
  ].filter(d => d.value > 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Call summary + donut */}
      <Card className="lg:col-span-2">
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-4">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Call Summary</span>
          </div>
          {loading ? (
            <div className="h-[200px] animate-pulse bg-muted rounded-xl" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Sized pie */}
              {donutData.length > 0 ? (
                <SizedPie
                  data={donutData}
                  centerValue={overview.unique_leads}
                  centerLabel="leads called"
                />
              ) : (
                <div className="flex h-[196px] items-center justify-center text-sm text-muted-foreground">
                  No calls in this period.
                </div>
              )}
              {/* Breakdown */}
              <div className="flex flex-col justify-center space-y-2.5">
                {donutData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{d.value}</span>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">
                        {overview.total > 0 ? `${Math.round(d.value / overview.total * 100)}%` : '0%'}
                      </span>
                    </div>
                  </div>
                ))}
                {overview.total === 0 && (
                  <p className="text-sm text-muted-foreground">No calls in this period.</p>
                )}

                {/* Lead status — current snapshot, not call outcomes */}
                <div className="mt-1 border-t border-border pt-2.5 space-y-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Lead status · % of leads</p>
                  {([
                    { label: 'Interested',     value: overview.interested,     dot: 'bg-emerald-500' },
                    { label: 'Not interested', value: overview.not_interested, dot: 'bg-muted-foreground/50' },
                    { label: 'Bad leads',      value: overview.bad_leads,      dot: 'bg-destructive' },
                  ] as const).map(s => (
                    <div key={s.label} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', s.dot)} />
                        <span className="text-muted-foreground">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{s.value}</span>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">
                          {overview.leads_total > 0 ? `${Math.round(s.value / overview.leads_total * 100)}%` : '0%'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats column */}
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Answer Rate</span>
            </div>
            {loading ? <div className="h-12 animate-pulse bg-muted rounded" /> : (
              <>
                <p className="text-4xl font-bold">{answerRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">{overview.answered} answered of {overview.total} calls</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Follow-ups</span>
            </div>
            {loading ? <div className="h-12 animate-pulse bg-muted rounded" /> : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Pending</span>
                  <span className="font-bold">{overview.follow_ups_due}</span>
                </div>
                {overview.follow_ups_overdue > 0 && (
                  <div className="flex items-center justify-between text-sm rounded-md bg-destructive/10 px-2 py-1">
                    <span className="text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Overdue</span>
                    <span className="font-bold text-destructive">{overview.follow_ups_overdue}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Users className="h-3 w-3" /> Leads Active</span>
                  <span className="font-bold">{overview.leads_active} / {overview.leads_total}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads-called-per-day mini chart (honours the page's date range) */}
        <DailyCallsMiniChart start={start} end={end} />
      </div>
    </div>
  )
}

// ── Main analytics component ──────────────────────────────────────────────
interface Props { userRole: string; userId: string }

function AnalyticsContent({ userRole }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const range        = (searchParams.get('range') as DateRangePreset) ?? '30d'
  const tabParam     = searchParams.get('tab') as AnalyticsTab ?? 'overview'

  const isRep   = userRole === 'rep'
  const isAdmin = ['admin', 'super_admin'].includes(userRole)

  const visibleTabs = TABS.filter(t => canSee(t.minRole, userRole))
  const activeTab   = visibleTabs.find(t => t.id === tabParam) ? tabParam : visibleTabs[0]?.id ?? 'overview'

  const { start, end } = React.useMemo(() => {
    const now = new Date()
    const end = now.toISOString()
    let start = new Date(now)
    if (range === 'today')   { start.setHours(0, 0, 0, 0) }
    else if (range === '7d') { start.setDate(start.getDate() - 7) }
    else if (range === 'all'){ start = new Date('1970-01-01T00:00:00Z') }
    else                      { start.setDate(start.getDate() - 30) }
    return { start: start.toISOString(), end }
  }, [range])

  const [overview,  setOverview]  = useState<CallOverview>(EMPTY_OVERVIEW)
  const [reps,      setReps]      = useState<RepRow[]>([])

  const [loadingReps,    setLR] = useState(false)

  const fetchReps = useCallback(async () => {
    if (!isAdmin) return
    setLR(true)
    try {
      const res = await fetch(`/api/analytics/reps?start=${start}&end=${end}`)
      if (res.ok) {
        const d = await res.json()
        setReps(d.reps ?? [])
        if (d.overview) setOverview(d.overview)
      }
    } catch {} finally { setLR(false) }
  }, [start, end, isAdmin])

  useEffect(() => {
    void fetchReps()
  }, [fetchReps])

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set(key, value)
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }

  const isLoading = loadingReps

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <BarChart2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">{isRep ? 'My Analytics' : 'Team Analytics'}</h1>
                <p className="text-xs text-muted-foreground">
                  {reps.length > 0 && !isRep ? `${reps.length} reps · ` : ''}{overview.unique_leads} called · {overview.total} calls · {overview.leads_total} leads
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DateRangePicker value={range} onChange={v => setParam('range', v)} className="hidden md:flex" />
              <AnalyticsExportButton view={activeTab} start={start} end={end} />
              <Button variant="outline" size="sm" onClick={() => { void fetchReps() }}
                disabled={isLoading} className="gap-1.5 h-9">
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
          <div className="pb-3 md:hidden">
            <DateRangePicker value={range} onChange={v => setParam('range', v)} className="w-full" />
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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {activeTab === 'overview' && (
          <OverviewCards overview={overview} loading={isAdmin ? loadingReps : false} start={start} end={end} />
        )}

        {activeTab === 'reps' && isAdmin && (
          <RepPerformanceTable reps={reps} loading={loadingReps} start={start} end={end} />
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
