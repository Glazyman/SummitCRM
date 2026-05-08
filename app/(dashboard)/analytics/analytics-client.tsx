'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  LeadFunnelChart, RepPerformanceTable, BatchComparisonTable, AnalyticsExportButton,
} from '@/components/analytics'
import type { FunnelData, RepRow, BatchRow, CallOverview, AnalyticsTab } from '@/components/analytics'
import { DateRangePicker } from '@/components/admin/date-range-picker'
import type { DateRangePreset } from '@/components/admin/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button }  from '@/components/ui/button'
import { Badge }   from '@/components/ui/badge'
import { RefreshCw, BarChart2, Phone, Calendar, Users, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts'

interface TabConfig { id: AnalyticsTab; label: string; minRole: string }

const TABS: TabConfig[] = [
  { id: 'overview', label: 'Overview',         minRole: 'rep'   },
  { id: 'reps',     label: 'Rep Performance',  minRole: 'admin' },
  { id: 'funnel',   label: 'Lead Funnel',      minRole: 'rep'   },
  { id: 'batches',  label: 'Batches',          minRole: 'rep'   },
]

const ROLE_RANK: Record<string, number> = { rep: 1, admin: 2, super_admin: 3 }
function canSee(tabRole: string, userRole: string) {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[tabRole] ?? 0)
}

const EMPTY_FUNNEL: FunnelData = { funnel: [], breakdown: [], total: 0 }
const EMPTY_OVERVIEW: CallOverview = {
  total: 0, answered: 0, voicemail: 0, no_answer: 0, wrong_number: 0, callback: 0,
  follow_ups_due: 0, follow_ups_overdue: 0, leads_total: 0, leads_active: 0,
}

const OUTCOME_COLORS: Record<string, string> = {
  answered:  '#10b981',
  voicemail: '#a855f7',
  no_answer: '#94a3b8',
  wrong:     '#ef4444',
  callback:  '#f59e0b',
}

// ── Overview summary cards ────────────────────────────────────────────────
function OverviewCards({ overview, loading }: { overview: CallOverview; loading: boolean }) {
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
              {/* Donut */}
              <div className="relative">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={2} dataKey="value" strokeWidth={0}>
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <RTooltip formatter={(v) => [String(v)]} contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', background: 'hsl(var(--popover))' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold">{overview.total}</span>
                  <span className="text-[11px] text-muted-foreground">calls</span>
                </div>
              </div>
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
      </div>
    </div>
  )
}

// ── Main analytics component ──────────────────────────────────────────────
interface Props { userRole: string; userId: string }

function AnalyticsContent({ userRole, userId }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const range        = (searchParams.get('range') as DateRangePreset) ?? '30d'
  const tabParam     = searchParams.get('tab') as AnalyticsTab ?? 'overview'

  const isRep   = userRole === 'rep'
  const isAdmin = ['admin', 'super_admin'].includes(userRole)

  const visibleTabs = TABS.filter(t => canSee(t.minRole, userRole))
  const activeTab   = visibleTabs.find(t => t.id === tabParam) ? tabParam : visibleTabs[0]?.id ?? 'overview'

  function dateRangeForPreset(preset: DateRangePreset): { start: string; end: string } {
    const now = new Date()
    const end = now.toISOString()
    let start = new Date(now)
    if (preset === 'today')       { start.setHours(0,0,0,0) }
    else if (preset === '7d')     { start.setDate(start.getDate() - 7) }
    else if (preset === 'month')  { start = new Date(now.getFullYear(), now.getMonth(), 1) }
    else                           { start.setDate(start.getDate() - 30) }
    return { start: start.toISOString(), end }
  }

  const { start, end } = dateRangeForPreset(range)

  const [overview,  setOverview]  = useState<CallOverview>(EMPTY_OVERVIEW)
  const [reps,      setReps]      = useState<RepRow[]>([])
  const [funnel,    setFunnel]    = useState<FunnelData>(EMPTY_FUNNEL)
  const [batches,   setBatches]   = useState<BatchRow[]>([])

  const [loadingReps,    setLR] = useState(false)
  const [loadingFunnel,  setLF] = useState(false)
  const [loadingBatches, setLB] = useState(false)

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

  const fetchFunnel = useCallback(async () => {
    setLF(true)
    try {
      const res = await fetch('/api/analytics/funnel')
      if (res.ok) setFunnel(await res.json())
    } catch {} finally { setLF(false) }
  }, [])

  const fetchBatches = useCallback(async () => {
    setLB(true)
    try {
      const res = await fetch('/api/analytics/batches')
      if (res.ok) { const d = await res.json(); setBatches(d.batches ?? []) }
    } catch {} finally { setLB(false) }
  }, [])

  useEffect(() => {
    void fetchReps()
    void fetchFunnel()
    void fetchBatches()
  }, [fetchReps, fetchFunnel, fetchBatches])

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
                  {reps.length > 0 && !isRep ? `${reps.length} reps · ` : ''}{overview.total} calls · {overview.leads_total} leads
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DateRangePicker value={range} onChange={v => setParam('range', v)} className="hidden md:flex" />
              <AnalyticsExportButton view={activeTab} start={start} end={end} />
              <Button variant="outline" size="sm" onClick={() => { void fetchReps(); void fetchFunnel(); void fetchBatches() }}
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
          <OverviewCards overview={overview} loading={isAdmin ? loadingReps : false} />
        )}

        {activeTab === 'reps' && isAdmin && (
          <RepPerformanceTable reps={reps} loading={loadingReps} />
        )}

        {activeTab === 'funnel' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <LeadFunnelChart data={funnel} loading={loadingFunnel} />
            <div className="space-y-3">
              {funnel.funnel.slice(1).map((stage, i) => {
                const prev = funnel.funnel[i]
                const kept = prev?.count > 0 ? Math.round(stage.count / prev.count * 100) : 0
                return (
                  <div key={stage.status} className="rounded-xl border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{prev?.status} → {stage.status}</span>
                      <Badge variant="secondary" className="text-xs">{kept}% continue</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${kept}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {stage.count.toLocaleString()} / {prev?.count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              })}
              {funnel.funnel.length === 0 && (
                <div className="rounded-xl border p-8 text-center text-muted-foreground text-sm">No funnel data yet.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'batches' && (
          <BatchComparisonTable batches={batches} loading={loadingBatches} />
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
