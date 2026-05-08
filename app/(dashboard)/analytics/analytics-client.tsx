'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  EmailMetricsCards, EmailTimeSeriesChart, LeadFunnelChart,
  CampaignComparisonTable, RepPerformanceTable, BatchComparisonTable,
  AnalyticsExportButton,
} from '@/components/analytics'
import type { EmailMetrics, TimeSeriesPoint, FunnelData, CampaignRow, RepRow, BatchRow, AnalyticsTab } from '@/components/analytics'
import { DateRangePicker } from '@/components/admin/date-range-picker'
import type { DateRangePreset } from '@/components/admin/types'
import { Button }  from '@/components/ui/button'
import { Badge }   from '@/components/ui/badge'
import { RefreshCw, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Tabs config ────────────────────────────────────────────────────────────
interface TabConfig {
  id:      AnalyticsTab
  label:   string
  minRole: string
}

const TABS: TabConfig[] = [
  { id: 'overview',   label: 'Overview',   minRole: 'rep'     },
  { id: 'campaigns',  label: 'Campaigns',  minRole: 'manager' },
  { id: 'funnel',     label: 'Funnel',     minRole: 'rep'     },
  { id: 'reps',       label: 'Rep stats',  minRole: 'admin'   },
  { id: 'batches',    label: 'Batches',    minRole: 'manager' },
]

const ROLE_RANK: Record<string, number> = { viewer: 0, rep: 1, manager: 2, admin: 3, super_admin: 4 }
function canSee(tabRole: string, userRole: string) {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[tabRole] ?? 0)
}

const EMPTY_EMAIL_METRICS: EmailMetrics = {
  period: { start: '', end: '' },
  totals: {
    sent: 0,
    opened: 0,
    clicked: 0,
    replied: 0,
    bounced: 0,
    open_rate: 0,
    click_rate: 0,
    reply_rate: 0,
    bounce_rate: 0,
  },
}

const EMPTY_FUNNEL: FunnelData = {
  funnel: [],
  breakdown: [],
  total: 0,
}

interface Props {
  userRole:  string
  userId:    string
}

function AnalyticsContent({ userRole, userId }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const range        = (searchParams.get('range') as DateRangePreset) ?? '30d'
  const tabParam     = searchParams.get('tab') as AnalyticsTab ?? 'overview'

  const isRep    = userRole === 'rep'
  const isAdmin  = ['admin', 'super_admin'].includes(userRole)
  const pageTitle = isRep ? 'My Analytics' : 'Team Analytics'

  const visibleTabs = TABS.filter(t => canSee(t.minRole, userRole))
  const activeTab   = visibleTabs.find(t => t.id === tabParam) ? tabParam : visibleTabs[0]?.id ?? 'overview'

  // ── Date range helpers ───────────────────────────────────────────────────
  function dateRangeForPreset(preset: DateRangePreset): { start: string; end: string } {
    const now = new Date()
    const end = now.toISOString()
    let start = new Date(now)
    if (preset === 'today')  { start.setHours(0,0,0,0) }
    else if (preset === '7d')    { start.setDate(start.getDate() - 7) }
    else if (preset === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1) }
    else                         { start.setDate(start.getDate() - 30) }
    return { start: start.toISOString(), end }
  }

  const { start, end } = dateRangeForPreset(range)

  // ── State ─────────────────────────────────────────────────────────────────
  const [metrics,   setMetrics]   = useState<EmailMetrics>(EMPTY_EMAIL_METRICS)
  const [series,    setSeries]    = useState<TimeSeriesPoint[]>([])
  const [funnel,    setFunnel]    = useState<FunnelData>(EMPTY_FUNNEL)
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [reps,      setReps]      = useState<RepRow[]>([])
  const [batches,   setBatches]   = useState<BatchRow[]>([])

  const [loadingMetrics,   setLM] = useState(false)
  const [loadingSeries,    setLS] = useState(false)
  const [loadingFunnel,    setLF] = useState(false)
  const [loadingCampaigns, setLC] = useState(false)
  const [loadingReps,      setLR] = useState(false)
  const [loadingBatches,   setLB] = useState(false)

  // ── Fetchers ─────────────────────────────────────────────────────────────
  const fetchMetrics = useCallback(async () => {
    setLM(true)
    try {
      const p = new URLSearchParams({ start, end })
      if (isRep) p.set('rep_id', userId)
      const res = await fetch(`/api/analytics/email-metrics?${p}`)
      if (res.ok) setMetrics(await res.json())
    } catch {} finally { setLM(false) }
  }, [start, end, isRep, userId])

  const fetchSeries = useCallback(async () => {
    setLS(true)
    try {
      const p = new URLSearchParams({ start, end })
      if (isRep) p.set('rep_id', userId)
      const res = await fetch(`/api/analytics/time-series?${p}`)
      if (res.ok) { const d = await res.json(); setSeries(d.series ?? []) }
    } catch {} finally { setLS(false) }
  }, [start, end, isRep, userId])

  const fetchFunnel = useCallback(async () => {
    setLF(true)
    try {
      const res = await fetch('/api/analytics/funnel')
      if (res.ok) setFunnel(await res.json())
    } catch {} finally { setLF(false) }
  }, [])

  const fetchCampaigns = useCallback(async () => {
    setLC(true)
    try {
      const res = await fetch(`/api/analytics/campaigns?start=${start}&end=${end}`)
      if (res.ok) { const d = await res.json(); setCampaigns(d.campaigns ?? []) }
    } catch {} finally { setLC(false) }
  }, [start, end])

  const fetchReps = useCallback(async () => {
    if (!isAdmin) return
    setLR(true)
    try {
      const res = await fetch(`/api/analytics/reps?start=${start}&end=${end}`)
      if (res.ok) { const d = await res.json(); setReps(d.reps ?? []) }
    } catch {} finally { setLR(false) }
  }, [start, end, isAdmin])

  const fetchBatches = useCallback(async () => {
    setLB(true)
    try {
      const res = await fetch('/api/analytics/batches')
      if (res.ok) { const d = await res.json(); setBatches(d.batches ?? []) }
    } catch {} finally { setLB(false) }
  }, [])

  // Load on range change
  useEffect(() => {
    void fetchMetrics()
    void fetchSeries()
    void fetchFunnel()
    void fetchCampaigns()
    void fetchReps()
    void fetchBatches()
  }, [fetchMetrics, fetchSeries, fetchFunnel, fetchCampaigns, fetchReps, fetchBatches])

  const setParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set(key, value)
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }

  const isLoading = loadingMetrics || loadingSeries

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <BarChart2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">{pageTitle}</h1>
                {isRep && <p className="text-xs text-muted-foreground">Showing your personal stats</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DateRangePicker value={range} onChange={v => setParam('range', v)} className="hidden md:flex" />
              <AnalyticsExportButton view={activeTab} start={start} end={end} />
              <Button variant="outline" size="sm" onClick={() => { void fetchMetrics(); void fetchSeries() }}
                disabled={isLoading} className="gap-1.5 h-9">
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>

          {/* Mobile date range */}
          <div className="pb-3 md:hidden">
            <DateRangePicker value={range} onChange={v => setParam('range', v)} className="w-full" />
          </div>

          {/* ── Tab bar ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-0 -mb-px overflow-x-auto hide-scrollbar">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setParam('tab', tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <>
            <EmailMetricsCards metrics={metrics} loading={loadingMetrics} />
            <EmailTimeSeriesChart data={series} loading={loadingSeries} />
          </>
        )}

        {/* Campaigns tab */}
        {activeTab === 'campaigns' && (
          <CampaignComparisonTable campaigns={campaigns} loading={loadingCampaigns} />
        )}

        {/* Funnel tab */}
        {activeTab === 'funnel' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <LeadFunnelChart data={funnel} loading={loadingFunnel} />

            {/* Funnel rates summary card */}
            <div className="space-y-4">
              {/* Contact rate */}
              {funnel.funnel.slice(1).map((stage, i) => {
                const prev   = funnel.funnel[i]
                const drop   = prev?.count > 0 ? Math.round((1 - stage.count / prev.count) * 1000) / 10 : 0
                const kept   = 100 - drop
                const colors  = ['bg-secondary','bg-secondary','bg-secondary','bg-secondary']
                return (
                  <div key={stage.status} className="rounded-xl border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{prev.status} → {stage.status}</span>
                      <Badge variant={kept >= 50 ? 'secondary' : 'outline'} className="text-xs">
                        {kept}% continue
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className={cn('h-full rounded-full', colors[i] ?? 'bg-primary')}
                          style={{ width: `${kept}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 w-28 text-right">
                        {stage.count.toLocaleString()} / {prev.count.toLocaleString()} leads
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Reps tab (admin only) */}
        {activeTab === 'reps' && isAdmin && (
          <RepPerformanceTable reps={reps} loading={loadingReps} />
        )}

        {/* Batches tab */}
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
