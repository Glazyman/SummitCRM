'use client'

import * as React from 'react'
import { Phone, Calendar, Users, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts'

// Rolling date-range presets — match the analytics page exactly.
type Preset = 'today' | '7d' | '30d' | 'all'

interface RepStat {
  id:                string
  name:              string
  role:              string
  calls:             number
  callsByOutcome:    Record<string, number>
  followUpsPending:  number
  followUpsOverdue:  number
  followUpsCompleted: number
  leadsAssigned:     number
  leadsActive:       number
  /** Unique leads this rep called in the selected period. */
  leadsCalledInPeriod: number
  /** Daily target (workspace default + per-rep override). */
  dailyCallTarget:     number
}

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Today',
  '7d':  'Last 7 days',
  '30d': 'Last 30 days',
  all:   'All time',
}

// Rolling [start, end] for a preset — identical semantics to the analytics page.
function presetRange(preset: Preset): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString()
  let start = new Date(now)
  if (preset === 'today')    { start.setHours(0, 0, 0, 0) }
  else if (preset === '7d')  { start.setDate(start.getDate() - 7) }
  else if (preset === 'all') { start = new Date('1970-01-01T00:00:00Z') }
  else                       { start.setDate(start.getDate() - 30) }
  return { start: start.toISOString(), end }
}

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  answered:           { label: 'Answered',    color: '#10b981' },
  voicemail:          { label: 'Voicemail',   color: '#a855f7' },
  no_answer:          { label: 'No Answer',   color: '#94a3b8' },
  wrong_number:       { label: 'Wrong #',     color: '#ef4444' },
  callback_requested: { label: 'Callback',    color: '#f59e0b' },
}

// ── Donut chart for call outcomes ─────────────────────────────────────────
// Center = UNIQUE leads called (one per lead, "per person") to match the
// analytics page; the slices are call outcomes (which sum to raw calls), and
// raw call count is shown as a small secondary line.
function CallDonut({ reps, uniqueLeads }: { reps: RepStat[]; uniqueLeads: number }) {
  const totals: Record<string, number> = {}
  for (const rep of reps) {
    for (const [outcome, count] of Object.entries(rep.callsByOutcome)) {
      totals[outcome] = (totals[outcome] ?? 0) + count
    }
  }

  const data = Object.entries(totals)
    .filter(([, v]) => v > 0)
    .map(([outcome, value]) => ({
      name:  OUTCOME_META[outcome]?.label ?? outcome,
      value,
      color: OUTCOME_META[outcome]?.color ?? '#94a3b8',
    }))

  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No calls this period
      </div>
    )
  }

  return (
    <div className="relative [&_path]:!cursor-default [&_path]:!outline-none">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="50%"
            innerRadius={58} outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <RTooltip
            formatter={(val) => [`${String(val)}`]}
            contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', background: 'hsl(var(--popover))' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label — unique leads called (per person), raw calls secondary */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold leading-none">{uniqueLeads}</span>
        <span className="text-[11px] text-muted-foreground">leads called</span>
        <span className="mt-0.5 text-[10px] text-muted-foreground/70">{total} calls</span>
      </div>
      {/* Legend */}
      <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Horizontal bar per rep ────────────────────────────────────────────────
function RepCallBars({ reps }: { reps: RepStat[] }) {
  const maxCalls = Math.max(1, ...reps.map(r => r.calls))

  return (
    <div className="space-y-2.5">
      {reps.slice(0, 8).map(rep => {
        const outcomes = Object.entries(rep.callsByOutcome).filter(([, v]) => v > 0)
        return (
          <div key={rep.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate max-w-[120px]">{rep.name.split(' ')[0]}</span>
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{rep.leadsCalledInPeriod}</span> leads
                <span className="text-muted-foreground/60"> · {rep.calls} calls</span>
              </span>
            </div>
            {rep.calls > 0 ? (
              <div className="flex h-5 w-full overflow-hidden rounded-full bg-muted">
                {outcomes.map(([outcome, count]) => (
                  <div
                    key={outcome}
                    title={`${OUTCOME_META[outcome]?.label ?? outcome}: ${count}`}
                    style={{
                      width: `${(count / maxCalls) * 100}%`,
                      background: OUTCOME_META[outcome]?.color ?? '#94a3b8',
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="h-5 w-full rounded-full bg-muted/50" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function CallsByRepPanel({ reps }: { reps: RepStat[] }) {
  if (reps.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">No data</div>
  }
  return (
    <div className="mt-2">
      <RepCallBars reps={reps} />
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(OUTCOME_META).map(([, { label, color }]) => (
          <div key={label} className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export function RepPerformancePanel() {
  // Default to "Last 30 days" — matches the analytics page default and shows
  // recent activity without aging out as aggressively as a single day.
  const [preset, setPreset]   = React.useState<Preset>('30d')
  const [reps, setReps]       = React.useState<RepStat[]>([])
  const [uniqueLeads, setUniqueLeads] = React.useState(0)   // unique leads called in range (per person)
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState<string | null>(null)

  const load = React.useCallback(async (p: Preset) => {
    setLoading(true); setError(null)
    try {
      const { start, end } = presetRange(p)
      const res  = await fetch(`/api/admin/rep-performance?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setReps(json.reps ?? [])
      setUniqueLeads(json.uniqueLeads ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load(preset) }, [preset, load])

  React.useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') load(preset) }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [preset, load])

  // "Today" shows the per-rep daily-target progress bar; the rolling ranges
  // show a plain count of unique leads called in the window.
  const isToday = preset === 'today'

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Rep Performance</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date-range presets — same options as the analytics page */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(Object.keys(PRESET_LABELS) as Preset[]).map(p => (
              <button key={p} type="button" onClick={() => setPreset(p)}
                className={cn('px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap',
                  preset === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}>
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>

          <button type="button" onClick={() => load(preset)}
            className={cn('text-muted-foreground hover:text-foreground transition-colors', loading && 'animate-spin')}>
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-16 text-destructive gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> Call Outcomes
              </p>
              <CallDonut reps={reps} uniqueLeads={uniqueLeads} />
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Calls per Rep</p>
              <CallsByRepPanel reps={reps} />
            </div>
          </div>

          {/* Table */}
          {reps.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">No reps found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Rep</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground"
                        title="Unique leads called in the selected period">
                      {isToday ? 'Leads / Target' : 'Leads in period'}
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Calls</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Answered</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Voicemail</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">No Answer</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Follow-ups Due</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Overdue</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Completed</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Leads</th>
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
                          <p className="font-medium text-sm">{rep.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isToday ? (() => {
                          const target = rep.dailyCallTarget || 100
                          const done   = rep.leadsCalledInPeriod
                          const pct    = Math.min(100, Math.round((done / target) * 100))
                          const hit    = done >= target
                          return (
                            <div className="flex flex-col items-center gap-1 min-w-[80px]">
                              <span className={cn(
                                'text-sm font-semibold tabular-nums',
                                hit ? 'text-emerald-600' : done === 0 ? 'text-muted-foreground/40' : 'text-foreground'
                              )}>
                                {done} / {target}
                              </span>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all', hit ? 'bg-emerald-500' : 'bg-primary')}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })() : (
                          <span className={cn(
                            'text-sm font-semibold tabular-nums',
                            rep.leadsCalledInPeriod > 0 ? 'text-foreground' : 'text-muted-foreground/40'
                          )}>
                            {rep.leadsCalledInPeriod}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-bold',
                          rep.calls > 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40')}>
                          {rep.calls}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm" style={{ color: rep.callsByOutcome.answered ? '#10b981' : undefined }}>
                        {rep.callsByOutcome.answered ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center text-sm" style={{ color: rep.callsByOutcome.voicemail ? '#a855f7' : undefined }}>
                        {rep.callsByOutcome.voicemail ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                        {rep.callsByOutcome.no_answer ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-medium">
                        {rep.followUpsPending > 0 ? rep.followUpsPending : <span className="text-muted-foreground/40">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {rep.followUpsOverdue > 0
                          ? <span className="inline-flex items-center gap-1 text-sm font-medium text-destructive"><AlertTriangle className="h-3 w-3" />{rep.followUpsOverdue}</span>
                          : <span className="text-sm text-muted-foreground/40">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-muted-foreground">{rep.followUpsCompleted}</td>
                      <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                        {rep.leadsAssigned}
                        {rep.leadsActive < rep.leadsAssigned && (
                          <span className="text-[10px] ml-1">({rep.leadsActive})</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
