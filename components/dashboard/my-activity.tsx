'use client'

import * as React from 'react'
import { Phone, Calendar, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type Period = 'today' | 'week' | 'month'

interface MyStats {
  calls:            number
  callsByOutcome:   Record<string, number>
  followUpsPending:  number
  followUpsOverdue:  number
  followUpsCompleted: number
  leadsAssigned:    number
  leadsActive:      number
}

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week:  'This Week',
  month: 'This Month',
}

const OUTCOME_LABELS: Record<string, string> = {
  answered:           'Answered',
  voicemail:          'Voicemail',
  no_answer:          'No Answer',
  wrong_number:       'Wrong Number',
  callback_requested: 'Callback',
}

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

  const outcomes = stats ? Object.entries(stats.callsByOutcome).filter(([, v]) => v > 0) : []

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">My Activity</h2>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1 text-xs font-medium transition-colors',
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      ) : stats ? (
        <div className="p-5 grid gap-4 sm:grid-cols-2">
          {/* Calls */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calls</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight">{stats.calls}</span>
              <span className="text-sm text-muted-foreground">total {PERIOD_LABELS[period].toLowerCase()}</span>
            </div>
            {outcomes.length > 0 && (
              <div className="space-y-1.5">
                {outcomes.map(([outcome, count]) => (
                  <div key={outcome} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{OUTCOME_LABELS[outcome] ?? outcome}</span>
                    <span className="font-medium tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {stats.calls === 0 && (
              <p className="text-sm text-muted-foreground">No calls logged {PERIOD_LABELS[period].toLowerCase()}.</p>
            )}
          </div>

          {/* Follow-ups */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-ups</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Pending
                </div>
                <span className={cn('font-bold tabular-nums', stats.followUpsPending > 0 ? 'text-foreground' : 'text-muted-foreground/40')}>
                  {stats.followUpsPending}
                </span>
              </div>
              {stats.followUpsOverdue > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Overdue
                  </div>
                  <span className="font-bold tabular-nums text-destructive">{stats.followUpsOverdue}</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Completed {PERIOD_LABELS[period].toLowerCase()}
                </div>
                <span className={cn('font-bold tabular-nums', stats.followUpsCompleted > 0 ? 'text-foreground' : 'text-muted-foreground/40')}>
                  {stats.followUpsCompleted}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
