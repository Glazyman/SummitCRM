'use client'

import React from 'react'
import { Phone, Calendar, AlertTriangle, CheckCircle2, Users } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import type { RepRow } from './types'

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

// ── Per-rep donut ──────────────────────────────────────────────────────────
function RepDonut({ rep }: { rep: RepRow }) {
  const data = [
    { name: 'Answered',  value: rep.calls_answered,     color: OUTCOME_COLORS.answered  },
    { name: 'Voicemail', value: rep.calls_voicemail,    color: OUTCOME_COLORS.voicemail },
    { name: 'No Answer', value: rep.calls_no_answer,    color: OUTCOME_COLORS.no_answer },
    { name: 'Wrong #',   value: rep.calls_wrong_number, color: OUTCOME_COLORS.wrong_number },
  ].filter(d => d.value > 0)

  if (rep.calls === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground/50">
        No calls
      </div>
    )
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={120}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={34} outerRadius={50} paddingAngle={2} dataKey="value" strokeWidth={0}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <RTooltip
            formatter={(v) => [String(v)]}
            contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px', background: 'hsl(var(--popover))' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold">{rep.calls}</span>
        <span className="text-[10px] text-muted-foreground">calls</span>
      </div>
    </div>
  )
}

// ── Single rep card ────────────────────────────────────────────────────────
function RepCard({ rep, rank }: { rep: RepRow; rank: number }) {
  const answerRate  = rep.calls > 0 ? Math.round(rep.calls_answered / rep.calls * 100) : 0
  const fuTotal     = rep.follow_ups_pending + rep.follow_ups_completed
  const fuPct       = fuTotal > 0 ? Math.round(rep.follow_ups_completed / fuTotal * 100) : 0
  const maxOutcome  = Math.max(rep.calls_answered, rep.calls_voicemail, rep.calls_no_answer, rep.calls_wrong_number, 1)

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {initials(rep.full_name, rep.user_email)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{rep.full_name ?? rep.user_email}</p>
          <p className="text-xs text-muted-foreground capitalize">{rep.role === 'super_admin' ? 'Admin' : rep.role}</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          #{rank}
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border">
        {/* Left — donut + answer rate */}
        <div className="p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" /> Calls
          </p>
          <RepDonut rep={rep} />
          {/* Answer rate */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Answer rate</span>
              <span className="font-bold" style={{ color: answerRate > 50 ? OUTCOME_COLORS.answered : undefined }}>
                {answerRate}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${answerRate}%`, background: OUTCOME_COLORS.answered }} />
            </div>
          </div>
          {/* Outcome breakdown */}
          {rep.calls > 0 && (
            <div className="space-y-1">
              {[
                { label: 'Answered',  value: rep.calls_answered,     color: OUTCOME_COLORS.answered  },
                { label: 'Voicemail', value: rep.calls_voicemail,    color: OUTCOME_COLORS.voicemail },
                { label: 'No Answer', value: rep.calls_no_answer,    color: OUTCOME_COLORS.no_answer },
                { label: 'Wrong #',   value: rep.calls_wrong_number, color: OUTCOME_COLORS.wrong_number },
              ].filter(r => r.value > 0).map(r => (
                <div key={r.label} className="flex items-center gap-1.5 text-[11px]">
                  <div className="h-1.5 rounded-full" style={{ width: `${Math.round(r.value / maxOutcome * 48)}px`, background: r.color, minWidth: '4px' }} />
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="ml-auto font-medium tabular-nums">{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — follow-ups + leads */}
        <div className="p-4 space-y-4">
          {/* Follow-ups */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Follow-ups
            </p>
            {/* Completion ring visual */}
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0">
                <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="14" fill="none"
                    stroke={fuPct === 100 ? OUTCOME_COLORS.answered : fuPct > 50 ? '#3b82f6' : '#f59e0b'}
                    strokeWidth="3"
                    strokeDasharray={`${fuPct * 0.879} 87.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold">{fuPct}%</span>
                </div>
              </div>
              <div className="space-y-0.5 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>{rep.follow_ups_completed} done</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{rep.follow_ups_pending} pending</span>
                </div>
                {rep.follow_ups_overdue > 0 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="font-medium">{rep.follow_ups_overdue} overdue</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Leads */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> Leads
            </p>
            <div className="text-2xl font-bold tabular-nums">{rep.leads_assigned}</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Active</span>
                <span className="font-medium">{rep.leads_active}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary"
                  style={{ width: rep.leads_assigned > 0 ? `${Math.round(rep.leads_active / rep.leads_assigned * 100)}%` : '0%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────
interface Props { reps: RepRow[]; loading?: boolean }

export function RepPerformanceTable({ reps, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card h-64 animate-pulse" />
        ))}
      </div>
    )
  }

  if (reps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
        <Users className="h-8 w-8 opacity-30" />
        <p className="text-sm">No reps found for this period.</p>
      </div>
    )
  }

  const sorted = [...reps].sort((a, b) => b.calls - a.calls)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{reps.length} rep{reps.length !== 1 ? 's' : ''} · ranked by call volume</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {sorted.map((rep, i) => (
          <RepCard key={rep.user_id} rep={rep} rank={i + 1} />
        ))}
      </div>
    </div>
  )
}
