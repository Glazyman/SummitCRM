'use client'

import * as React from 'react'
import { Phone, Calendar, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
  RadialBarChart, RadialBar,
} from 'recharts'

type Period = 'today' | 'week' | 'month'

interface MyStats {
  calls:             number
  callsByOutcome:    Record<string, number>
  followUpsPending:  number
  followUpsOverdue:  number
  followUpsCompleted: number
  leadsAssigned:     number
  leadsActive:       number
  funnel?: {
    calls_made: number
    conversations: number
    interested: number
    follow_ups_set: number
  }
}

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week:  'This Week',
  month: 'This Month',
}

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  answered:           { label: 'Answered',  color: '#10b981' },
  voicemail:          { label: 'Voicemail', color: '#a855f7' },
  no_answer:          { label: 'No Answer', color: '#94a3b8' },
  wrong_number:       { label: 'Wrong #',   color: '#ef4444' },
  callback_requested: { label: 'Callback',  color: '#f59e0b' },
}

// ── Call outcome donut ────────────────────────────────────────────────────
function CallDonut({ stats }: { stats: MyStats }) {
  const data = Object.entries(stats.callsByOutcome)
    .filter(([, v]) => v > 0)
    .map(([outcome, value]) => ({
      name:  OUTCOME_META[outcome]?.label ?? outcome,
      value,
      color: OUTCOME_META[outcome]?.color ?? '#94a3b8',
    }))

  if (data.length === 0) {
    return (
      <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-muted-foreground">
        <Phone className="h-8 w-8 opacity-20" />
        <span className="text-sm">No calls {/* period will be shown by parent */}</span>
      </div>
    )
  }

  return (
    <div className="relative [&_path]:!cursor-default [&_path]:!outline-none">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={2} dataKey="value" strokeWidth={0}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <RTooltip
            formatter={(val) => [String(val)]}
            contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', background: 'hsl(var(--popover))' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{stats.calls}</span>
        <span className="text-[11px] text-muted-foreground">calls</span>
      </div>
      {/* Outcome breakdown */}
      <div className="mt-2 space-y-1">
        {data.map(d => (
          <div key={d.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
              <span className="text-muted-foreground">{d.name}</span>
            </div>
            <span className="font-medium tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Follow-up completion ring ─────────────────────────────────────────────
function FollowUpRing({ stats }: { stats: MyStats }) {
  const total     = stats.followUpsPending + stats.followUpsCompleted
  const pct       = total > 0 ? Math.round((stats.followUpsCompleted / total) * 100) : 0
  const ringData  = [{ value: pct, fill: pct === 100 ? '#10b981' : pct > 50 ? '#3b82f6' : '#f59e0b' }]

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[180px]">
        <ResponsiveContainer width="100%" height={160}>
          <RadialBarChart cx="50%" cy="50%" innerRadius="62%" outerRadius="85%" startAngle={90} endAngle={-270} data={ringData}>
            <RadialBar dataKey="value" cornerRadius={6} background={{ fill: 'hsl(var(--muted))' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold">{pct}%</span>
          <span className="text-[11px] text-muted-foreground">done</span>
        </div>
      </div>
      {/* Stats */}
      <div className="mt-1 w-full space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Completed
          </div>
          <span className="font-medium">{stats.followUpsCompleted}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3 w-3" /> Pending
          </div>
          <span className="font-medium">{stats.followUpsPending}</span>
        </div>
        {stats.followUpsOverdue > 0 && (
          <div className="flex items-center justify-between text-xs rounded-md bg-destructive/10 px-2 py-1">
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-3 w-3" /> Overdue
            </div>
            <span className="font-bold text-destructive">{stats.followUpsOverdue}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export function MyActivityPanel() {
  const [period, setPeriod]   = React.useState<Period>('week')
  const [stats, setStats]     = React.useState<MyStats | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async (p: Period) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/rep/my-stats?period=${p}`)
      const json = await res.json()
      if (res.ok) setStats(json)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load(period) }, [period, load])

  // Refresh when user switches back to this tab or returns from another page
  React.useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') load(period) }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [period, load])

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">My Activity</h2>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={cn('px-3 py-1 text-xs font-medium transition-colors',
                period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      ) : stats ? (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {/* Calls donut */}
            <div className="p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> Calls {PERIOD_LABELS[period]}
              </p>
              <CallDonut stats={stats} />
            </div>

            {/* Follow-up ring */}
            <div className="p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Follow-up Completion
              </p>
              <FollowUpRing stats={stats} />
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Daily Conversion Funnel</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <FunnelStat label="Calls made" value={stats.funnel?.calls_made ?? 0} />
              <FunnelStat label="Conversations" value={stats.funnel?.conversations ?? 0} />
              <FunnelStat label="Interested" value={stats.funnel?.interested ?? 0} />
              <FunnelStat label="Follow-ups set" value={stats.funnel?.follow_ups_set ?? 0} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FunnelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
