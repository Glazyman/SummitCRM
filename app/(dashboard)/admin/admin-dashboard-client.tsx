'use client'

/**
 * app/(dashboard)/admin/admin-dashboard-client.tsx
 *
 * Client-side orchestrator for the admin dashboard.
 * Manages:
 *  - Date range state (synced with URL)
 *  - Per-section data fetching (parallel, with individual loading states)
 *  - Role-gating (admin vs manager view)
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  DateRangePicker,
  OverviewStatsRow,
  QuickActionsBar,
  TeamPerformanceTable,
  SendingAccountHealthTable,
  ActiveCampaignsSummary,
  AiUsageWidget,
  WorkspaceActivityFeed,
} from '@/components/admin'
import type {
  DateRangePreset,
  OverviewData, RepStat, SendingAccountHealth,
  CampaignSummary, AiUsageSummary, ActivityEvent,
} from '@/components/admin'
import {
  MOCK_OVERVIEW, MOCK_TEAM_STATS, MOCK_ACCOUNT_HEALTH,
  MOCK_CAMPAIGNS, MOCK_AI_USAGE, MOCK_ACTIVITY,
} from '@/components/admin/mock-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminDashboardClientProps {
  isAdmin:   boolean
  isManager: boolean
  userRole:  string
}

function AdminDashboardContent({ isAdmin, isManager, userRole }: AdminDashboardClientProps) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const range        = (searchParams.get('range') as DateRangePreset) ?? '30d'

  // ── Data state ────────────────────────────────────────────────────────────
  const [overview,  setOverview]  = useState<OverviewData>(MOCK_OVERVIEW)
  const [teamStats, setTeamStats] = useState<RepStat[]>(MOCK_TEAM_STATS)
  const [accounts,  setAccounts]  = useState<SendingAccountHealth[]>(MOCK_ACCOUNT_HEALTH)
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>(MOCK_CAMPAIGNS)
  const [aiUsage,   setAiUsage]   = useState<AiUsageSummary>(MOCK_AI_USAGE)
  const [activity,  setActivity]  = useState<ActivityEvent[]>(MOCK_ACTIVITY)

  // Per-section loading
  const [loadingOverview,  setLoadingOverview]  = useState(false)
  const [loadingTeam,      setLoadingTeam]      = useState(false)
  const [loadingAccounts,  setLoadingAccounts]  = useState(false)
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [loadingActivity,  setLoadingActivity]  = useState(false)
  const [lastRefreshed,    setLastRefreshed]    = useState(new Date())

  // ── Fetch helpers ─────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async (r: string) => {
    setLoadingOverview(true)
    try {
      const res  = await fetch(`/api/admin/overview?range=${r}`)
      if (res.ok) setOverview(await res.json())
    } catch {} finally { setLoadingOverview(false) }
  }, [])

  const fetchTeam = useCallback(async (r: string) => {
    setLoadingTeam(true)
    try {
      const res  = await fetch(`/api/admin/team-stats?range=${r}`)
      if (res.ok) { const d = await res.json(); setTeamStats(d.stats ?? []) }
    } catch {} finally { setLoadingTeam(false) }
  }, [])

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    try {
      const res  = await fetch('/api/admin/account-health')
      if (res.ok) { const d = await res.json(); setAccounts(d.accounts ?? []) }
    } catch {} finally { setLoadingAccounts(false) }
  }, [])

  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true)
    try {
      const res  = await fetch('/api/admin/campaigns-summary')
      if (res.ok) { const d = await res.json(); setCampaigns(d.campaigns ?? []) }
    } catch {} finally { setLoadingCampaigns(false) }
  }, [])

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true)
    try {
      const res  = await fetch('/api/admin/activity')
      if (res.ok) { const d = await res.json(); setActivity(d.events ?? []) }
    } catch {} finally { setLoadingActivity(false) }
  }, [])

  // ── Initial + range-change load ───────────────────────────────────────────
  useEffect(() => {
    void fetchOverview(range)
    void fetchTeam(range)
  }, [range, fetchOverview, fetchTeam])

  useEffect(() => {
    void fetchAccounts()
    void fetchCampaigns()
    void fetchActivity()
  }, [fetchAccounts, fetchCampaigns, fetchActivity])

  // ── Refresh all ───────────────────────────────────────────────────────────
  const refreshAll = () => {
    setLastRefreshed(new Date())
    void fetchOverview(range)
    void fetchTeam(range)
    void fetchAccounts()
    void fetchCampaigns()
    void fetchActivity()
    if (isAdmin) {
      fetch('/api/admin/ai-usage')
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setAiUsage(d))
        .catch(() => {})
    }
  }

  // ── Range picker ──────────────────────────────────────────────────────────
  const handleRangeChange = (preset: DateRangePreset) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', preset)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const quotaAlerts = accounts.filter((a) => a.quota_pct >= 80).length

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-4">
            {/* Title */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <LayoutDashboard className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold truncate">Admin Dashboard</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Last refreshed {lastRefreshed.toLocaleTimeString()}
                </p>
              </div>
              <Badge variant="outline" className="text-xs hidden md:flex">
                {userRole}
              </Badge>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <DateRangePicker value={range} onChange={handleRangeChange} className="hidden md:flex" />
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAll}
                disabled={loadingOverview}
                className="gap-1.5 h-9"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loadingOverview && 'animate-spin')} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>

          {/* Mobile: date range picker */}
          <div className="pb-3 md:hidden">
            <DateRangePicker value={range} onChange={handleRangeChange} className="w-full" />
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">

        {/* Quick actions */}
        <QuickActionsBar isAdmin={isAdmin} quotaAlerts={quotaAlerts} />

        {/* KPI overview row */}
        <OverviewStatsRow
          totals={overview.totals}
          activeCampaigns={overview.active_campaigns}
          loading={loadingOverview}
        />

        {/* Team + accounts — two column on large screens */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Team table spans 2/3 */}
          <div className="xl:col-span-2">
            <TeamPerformanceTable stats={teamStats} loading={loadingTeam} />
          </div>

          {/* Right column: AI widget + campaigns */}
          <div className="space-y-6">
            {isAdmin && (
              <AiUsageWidget usage={aiUsage} loading={false} />
            )}
            <ActiveCampaignsSummary
              campaigns={campaigns}
              isAdmin={isAdmin}
              loading={loadingCampaigns}
            />
          </div>
        </div>

        {/* Sending account health (full width) */}
        {isAdmin && (
          <SendingAccountHealthTable
            accounts={accounts}
            isAdmin={isAdmin}
            loading={loadingAccounts}
          />
        )}

        {/* Activity feed (full width) */}
        <WorkspaceActivityFeed events={activity} loading={loadingActivity} />

      </div>
    </div>
  )
}

export function AdminDashboardClient(props: AdminDashboardClientProps) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…
      </div>
    }>
      <AdminDashboardContent {...props} />
    </Suspense>
  )
}
