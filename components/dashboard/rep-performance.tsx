'use client'

import * as React from 'react'
import { Phone, Calendar, Users, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Period = 'today' | 'week' | 'month'

interface RepStat {
  id:               string
  name:             string
  role:             string
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

export function RepPerformancePanel() {
  const [period, setPeriod]   = React.useState<Period>('week')
  const [reps, setReps]       = React.useState<RepStat[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState<string | null>(null)

  const load = React.useCallback(async (p: Period) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/admin/rep-performance?period=${p}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setReps(json.reps ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load(period) }, [period, load])

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Rep Performance</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Period toggle */}
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
          <button
            type="button"
            onClick={() => load(period)}
            className={cn('text-muted-foreground hover:text-foreground transition-colors', loading && 'animate-spin')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-12 text-destructive text-sm gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      ) : reps.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          No reps found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Rep</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                  <div className="flex items-center justify-center gap-1"><Phone className="h-3 w-3" /> Calls</div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Answered</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Voicemail</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">No Answer</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                  <div className="flex items-center justify-center gap-1"><Calendar className="h-3 w-3" /> Follow-ups Due</div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Overdue</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Completed</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                  <div className="flex items-center justify-center gap-1"><Users className="h-3 w-3" /> Leads</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reps.map(rep => (
                <tr key={rep.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {rep.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{rep.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{rep.role === 'super_admin' ? 'Admin' : rep.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-bold',
                      rep.calls > 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40'
                    )}>
                      {rep.calls}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                    {rep.callsByOutcome.answered ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                    {rep.callsByOutcome.voicemail ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                    {rep.callsByOutcome.no_answer ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'text-sm font-medium',
                      rep.followUpsPending > 0 ? 'text-foreground' : 'text-muted-foreground/40'
                    )}>
                      {rep.followUpsPending}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {rep.followUpsOverdue > 0 ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {rep.followUpsOverdue}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground/40">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                    {rep.followUpsCompleted}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                    {rep.leadsAssigned}
                    {rep.leadsActive < rep.leadsAssigned && (
                      <span className="text-[10px] text-muted-foreground/60 ml-1">({rep.leadsActive} active)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
