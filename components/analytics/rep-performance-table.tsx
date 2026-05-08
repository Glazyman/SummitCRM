'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Users, Phone, Calendar, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, Trophy } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { cn } from '@/lib/utils'
import type { RepRow } from './types'

type SortKey = keyof Pick<RepRow, 'calls' | 'calls_answered' | 'follow_ups_completed' | 'follow_ups_overdue' | 'leads_assigned'>

const OUTCOME_COLORS: Record<string, string> = {
  answered:     '#10b981',
  voicemail:    '#a855f7',
  no_answer:    '#94a3b8',
  wrong_number: '#ef4444',
}

function initials(name: string | null, email: string) {
  if (name) { const p = name.split(' '); return (p[0]?.[0] ?? '') + (p[1]?.[0] ?? '') }
  return email[0]?.toUpperCase() ?? '?'
}

// ── Team-wide donut ───────────────────────────────────────────────────────
function TeamDonut({ reps }: { reps: RepRow[] }) {
  const answered  = reps.reduce((s, r) => s + r.calls_answered, 0)
  const voicemail = reps.reduce((s, r) => s + r.calls_voicemail, 0)
  const noAnswer  = reps.reduce((s, r) => s + r.calls_no_answer, 0)
  const wrong     = reps.reduce((s, r) => s + r.calls_wrong_number, 0)
  const total     = answered + voicemail + noAnswer + wrong

  const data = [
    { name: 'Answered',  value: answered,  color: OUTCOME_COLORS.answered  },
    { name: 'Voicemail', value: voicemail, color: OUTCOME_COLORS.voicemail },
    { name: 'No Answer', value: noAnswer,  color: OUTCOME_COLORS.no_answer },
    { name: 'Wrong #',   value: wrong,     color: OUTCOME_COLORS.wrong_number },
  ].filter(d => d.value > 0)

  if (total === 0) return <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">No calls in this period</div>

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={82} paddingAngle={2} dataKey="value" strokeWidth={0}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <RTooltip formatter={(v) => [String(v)]} contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', background: 'hsl(var(--popover))' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{total}</span>
        <span className="text-[11px] text-muted-foreground">total calls</span>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            {d.name} — {d.value}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Calls by rep bar chart ────────────────────────────────────────────────
function CallsByRepChart({ reps }: { reps: RepRow[] }) {
  const data = reps.slice(0, 10).map(r => ({
    name:     r.full_name?.split(' ')[0] ?? r.user_email.split('@')[0],
    answered: r.calls_answered,
    voicemail: r.calls_voicemail,
    no_answer: r.calls_no_answer,
    wrong:    r.calls_wrong_number,
  }))

  if (data.length === 0) return <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">No data</div>

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
        <RTooltip contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', background: 'hsl(var(--popover))' }} />
        <Bar dataKey="answered"  name="Answered"  stackId="a" fill={OUTCOME_COLORS.answered}  radius={[0, 0, 0, 0]} />
        <Bar dataKey="voicemail" name="Voicemail" stackId="a" fill={OUTCOME_COLORS.voicemail} />
        <Bar dataKey="no_answer" name="No Answer" stackId="a" fill={OUTCOME_COLORS.no_answer} />
        <Bar dataKey="wrong"     name="Wrong #"   stackId="a" fill={OUTCOME_COLORS.wrong_number} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Main table ────────────────────────────────────────────────────────────
interface Props { reps: RepRow[]; loading?: boolean }

export function RepPerformanceTable({ reps, loading }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'calls', dir: 'desc' })
  const sorted = useMemo(() =>
    [...reps].sort((a, b) => {
      const d = sort.dir === 'asc' ? 1 : -1
      return ((a[sort.key] as number) > (b[sort.key] as number) ? 1 : -1) * d
    }), [reps, sort])

  const onSort = (key: SortKey) => setSort(p => ({ key, dir: p.key === key && p.dir === 'desc' ? 'asc' : 'desc' }))
  const maxCalls = Math.max(...reps.map(r => r.calls), 1)

  const cols: Array<{ key: SortKey; label: string }> = [
    { key: 'calls',                label: 'Calls'       },
    { key: 'calls_answered',       label: 'Answered'    },
    { key: 'follow_ups_completed', label: 'FU Done'     },
    { key: 'follow_ups_overdue',   label: 'FU Overdue'  },
    { key: 'leads_assigned',       label: 'Leads'       },
  ]

  return (
    <div className="space-y-6">
      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Phone className="h-4 w-4" /> Call Outcome Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-[200px] animate-pulse bg-muted rounded-lg" /> : <TeamDonut reps={reps} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Calls by Rep</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-[220px] animate-pulse bg-muted rounded-lg" /> : <CallsByRepChart reps={reps} />}
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" /> Rep Details
            <span className="ml-auto text-sm font-normal text-muted-foreground">{reps.length} reps</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8">#</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Rep</th>
                  {cols.map(c => (
                    <th key={c.key} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                      <button onClick={() => onSort(c.key)} className="flex items-center gap-1 hover:text-foreground">
                        {c.label}
                        {sort.key === c.key
                          ? sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />
                          : <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" />}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Volume</th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 w-16 rounded bg-muted" /></td>
                    ))}
                  </tr>
                ))}
                {!loading && sorted.map((rep, i) => {
                  const isTop = i === 0 && rep.calls > 0
                  const fuPct = (rep.follow_ups_completed + rep.follow_ups_pending) > 0
                    ? Math.round(rep.follow_ups_completed / (rep.follow_ups_completed + rep.follow_ups_pending) * 100) : 0
                  return (
                    <tr key={rep.user_id} className={cn('border-b last:border-0 transition-colors', isTop ? 'bg-muted/40' : 'hover:bg-muted/30')}>
                      <td className="px-4 py-3 text-muted-foreground font-medium">
                        {isTop ? <Trophy className="h-4 w-4 text-amber-500" /> : i + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {initials(rep.full_name, rep.user_email)}
                          </div>
                          <div>
                            <p className="font-medium leading-tight">{rep.full_name ?? rep.user_email}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{rep.role}</p>
                          </div>
                        </div>
                      </td>
                      {/* Calls */}
                      <td className="px-4 py-3">
                        <span className={cn('text-lg font-bold tabular-nums', rep.calls === 0 && 'text-muted-foreground/40')}>{rep.calls}</span>
                      </td>
                      {/* Answered */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium" style={{ color: rep.calls_answered > 0 ? OUTCOME_COLORS.answered : undefined }}>
                            {rep.calls_answered}
                          </span>
                          {rep.calls > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {Math.round(rep.calls_answered / rep.calls * 100)}%
                            </span>
                          )}
                        </div>
                      </td>
                      {/* FU Completed */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span className="font-medium">{rep.follow_ups_completed}</span>
                          {(rep.follow_ups_completed + rep.follow_ups_pending) > 0 && (
                            <Progress value={fuPct} className="h-1 w-16" />
                          )}
                        </div>
                      </td>
                      {/* FU Overdue */}
                      <td className="px-4 py-3">
                        {rep.follow_ups_overdue > 0 ? (
                          <span className="flex items-center gap-1 font-medium text-destructive">
                            <AlertTriangle className="h-3 w-3" />{rep.follow_ups_overdue}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">0</span>
                        )}
                      </td>
                      {/* Leads */}
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium">{rep.leads_assigned}</span>
                          {rep.leads_active < rep.leads_assigned && (
                            <span className="text-[10px] text-muted-foreground ml-1">({rep.leads_active} active)</span>
                          )}
                        </div>
                      </td>
                      {/* Volume bar */}
                      <td className="px-4 py-3 w-28">
                        {rep.calls > 0 ? (
                          <div className="flex h-4 overflow-hidden rounded-full bg-muted w-24">
                            <div style={{ width: `${(rep.calls_answered / maxCalls) * 100}%`, background: OUTCOME_COLORS.answered }} />
                            <div style={{ width: `${(rep.calls_voicemail / maxCalls) * 100}%`, background: OUTCOME_COLORS.voicemail }} />
                            <div style={{ width: `${(rep.calls_no_answer / maxCalls) * 100}%`, background: OUTCOME_COLORS.no_answer }} />
                            <div style={{ width: `${(rep.calls_wrong_number / maxCalls) * 100}%`, background: OUTCOME_COLORS.wrong_number }} />
                          </div>
                        ) : (
                          <div className="h-4 w-24 rounded-full bg-muted/40" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
