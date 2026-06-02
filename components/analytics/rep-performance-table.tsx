'use client'

import React from 'react'
import { Phone, Calendar, AlertTriangle, CheckCircle2, Users, X } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import type { RepRow } from './types'

const OUTCOME_COLORS: Record<string, string> = {
  answered:     '#4b8f7a',
  voicemail:    '#7c6aa7',
  no_answer:    '#7f8b9a',
  wrong_number: '#b56a6a',
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
function RepCard({ rep, rank, callView, onOpen }: { rep: RepRow; rank: number; callView: 'unique' | 'all'; onOpen: (rep: RepRow) => void }) {
  const answerRate  = rep.calls > 0 ? Math.round(rep.calls_answered / rep.calls * 100) : 0
  const fuTotal     = rep.follow_ups_pending + rep.follow_ups_completed
  const fuPct       = fuTotal > 0 ? Math.round(rep.follow_ups_completed / fuTotal * 100) : 0
  const maxOutcome  = Math.max(rep.calls_answered, rep.calls_voicemail, rep.calls_no_answer, rep.calls_wrong_number, 1)
  const activeLeadPct = rep.leads_assigned > 0 ? Math.round((rep.leads_active / rep.leads_assigned) * 100) : 0

  return (
    <button
      type="button"
      onClick={() => onOpen(rep)}
      className="w-full text-left rounded-2xl border border-border bg-card overflow-hidden transition-all hover:border-foreground/25 hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/25">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {initials(rep.full_name, rep.user_email)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{rep.full_name ?? rep.user_email}</p>
          <p className="text-xs text-muted-foreground capitalize">{rep.role === 'super_admin' ? 'Admin' : rep.role}</p>
        </div>
        <span className="text-xs font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          #{rank}
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-border bg-background">
        <div className="rounded-lg border border-border px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{callView === 'unique' ? 'Leads Called' : 'Calls'}</p>
          <p className="text-base font-bold tabular-nums">{callView === 'unique' ? rep.unique_leads : rep.calls}</p>
        </div>
        <div className="rounded-lg border border-border px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Answer Rate</p>
          <p className="text-base font-bold tabular-nums">{answerRate}%</p>
        </div>
        <div className="rounded-lg border border-border px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Follow-up Done</p>
          <p className="text-base font-bold tabular-nums">{fuPct}%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border">
        {/* Left — donut + answer rate */}
        <div className="p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" /> Calls
          </p>
          <RepDonut rep={rep} />

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
                  <CheckCircle2 className="h-3 w-3 text-emerald-700" />
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
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active</span>
                <span className="font-medium">{rep.leads_active} ({activeLeadPct}%)</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary"
                  style={{ width: rep.leads_assigned > 0 ? `${Math.round(rep.leads_active / rep.leads_assigned * 100)}%` : '0%' }} />
              </div>
              {rep.leads_new > 0 && (
                <div className="flex items-center justify-between rounded-md bg-slate-100 border border-slate-300 px-2 py-1">
                  <span className="text-slate-700 font-medium">New (untouched)</span>
                  <span className="font-bold text-slate-800">{rep.leads_new}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function RepDetailDrawer({
  rep,
  onClose,
  detail,
  loading,
  error,
  showMoreFollowUps,
  setShowMoreFollowUps,
  showMoreCalls,
  setShowMoreCalls,
}: {
  rep: RepRow
  onClose: () => void
  detail: RepDetailData | null
  loading: boolean
  error: string | null
  showMoreFollowUps: boolean
  setShowMoreFollowUps: (v: boolean) => void
  showMoreCalls: boolean
  setShowMoreCalls: (v: boolean) => void
}) {
  const answerRate = rep.calls > 0 ? Math.round((rep.calls_answered / rep.calls) * 100) : 0
  const voicemailRate = rep.calls > 0 ? Math.round((rep.calls_voicemail / rep.calls) * 100) : 0
  const noAnswerRate = rep.calls > 0 ? Math.round((rep.calls_no_answer / rep.calls) * 100) : 0
  const wrongRate = rep.calls > 0 ? Math.round((rep.calls_wrong_number / rep.calls) * 100) : 0
  const followUpsTotal = rep.follow_ups_completed + rep.follow_ups_pending
  const followUpCompletionRate = followUpsTotal > 0 ? Math.round((rep.follow_ups_completed / followUpsTotal) * 100) : 0
  const leadActivityRate = rep.leads_assigned > 0 ? Math.round((rep.leads_active / rep.leads_assigned) * 100) : 0

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/30" aria-label="Close detail view" />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl border-l border-border bg-background shadow-2xl">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rep Performance Detail</p>
              <h3 className="text-lg font-semibold">{rep.full_name ?? rep.user_email}</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-5 space-y-5">
            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-semibold">Calls</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Total Calls" value={rep.calls} />
                <Stat label="Answered" value={`${rep.calls_answered} (${answerRate}%)`} />
                <Stat label="Voicemail" value={`${rep.calls_voicemail} (${voicemailRate}%)`} />
                <Stat label="No Answer" value={`${rep.calls_no_answer} (${noAnswerRate}%)`} />
                <Stat label="Wrong Number" value={`${rep.calls_wrong_number} (${wrongRate}%)`} />
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-semibold">Follow-ups</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Pending" value={rep.follow_ups_pending} />
                <Stat label="Completed" value={rep.follow_ups_completed} />
                <Stat label="Overdue" value={rep.follow_ups_overdue} />
                <Stat label="Completion Rate" value={`${followUpCompletionRate}%`} />
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-semibold">Leads</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Assigned" value={rep.leads_assigned} />
                <Stat label="Active" value={rep.leads_active} />
                <Stat label="New (Untouched)" value={rep.leads_new} />
                <Stat label="Active Rate" value={`${leadActivityRate}%`} />
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-semibold">Follow-ups (Who They Are)</p>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading follow-ups…</p>
              ) : error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : !detail || detail.followUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No follow-ups found for this range.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {(showMoreFollowUps ? detail.followUps : detail.followUps.slice(0, 10)).map((fu) => {
                      const leadName = fu.lead
                        ? [fu.lead.first_name, fu.lead.last_name].filter(Boolean).join(' ') || fu.lead.email
                        : 'Unknown lead'
                      return (
                        <div key={fu.id} className="rounded-md border border-border px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium truncate">{leadName}</p>
                            <p className="text-xs text-muted-foreground">{new Date(fu.due_at).toLocaleString()}</p>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {fu.lead?.company ? `${fu.lead.company} · ` : ''}{fu.title}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  {detail.followUps.length > 10 && (
                    <button
                      type="button"
                      onClick={() => setShowMoreFollowUps(!showMoreFollowUps)}
                      className="mt-3 text-sm font-medium text-primary hover:underline"
                    >
                      {showMoreFollowUps ? 'Show less follow-ups' : `Show more follow-ups (${detail.followUps.length - 10} more)`}
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-semibold">Recent Calls</p>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading calls…</p>
              ) : error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : !detail || detail.calls.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls found for this range.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {(showMoreCalls ? detail.calls : detail.calls.slice(0, 10)).map((call) => {
                      const leadName = call.lead
                        ? [call.lead.first_name, call.lead.last_name].filter(Boolean).join(' ') || call.lead.email
                        : 'Unknown lead'
                      return (
                        <div key={call.id} className="rounded-md border border-border px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium truncate">{leadName}</p>
                            <p className="text-xs text-muted-foreground">{new Date(call.called_at).toLocaleString()}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Outcome: {call.outcome.replace('_', ' ')}{call.notes ? ` · ${call.notes}` : ''}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  {detail.calls.length > 10 && (
                    <button
                      type="button"
                      onClick={() => setShowMoreCalls(!showMoreCalls)}
                      className="mt-3 text-sm font-medium text-primary hover:underline"
                    >
                      {showMoreCalls ? 'Show less calls' : `Show more calls (${detail.calls.length - 10} more)`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────
interface Props { reps: RepRow[]; loading?: boolean }

interface RepDetailData {
  followUps: Array<{
    id: string
    title: string
    due_at: string
    completed_at: string | null
    notes: string | null
    lead: { first_name: string | null; last_name: string | null; company: string | null; email: string } | null
  }>
  calls: Array<{
    id: string
    outcome: string
    called_at: string
    notes: string | null
    lead: { first_name: string | null; last_name: string | null; company: string | null; email: string } | null
  }>
}

export function RepPerformanceTable({ reps, loading, start, end }: Props & { start?: string; end?: string }) {
  const [selectedRep, setSelectedRep] = React.useState<RepRow | null>(null)
  const [detail, setDetail] = React.useState<RepDetailData | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [showMoreFollowUps, setShowMoreFollowUps] = React.useState(false)
  const [showMoreCalls, setShowMoreCalls] = React.useState(false)
  // Per-rep headline metric: "Per person" (unique leads called) by default,
  // with an option to view raw "All calls".
  const [callView, setCallView] = React.useState<'unique' | 'all'>('unique')

  React.useEffect(() => {
    async function loadDetail() {
      if (!selectedRep) return
      setDetailLoading(true)
      setDetailError(null)
      setDetail(null)
      setShowMoreFollowUps(false)
      setShowMoreCalls(false)
      try {
        const params = new URLSearchParams()
        if (start) params.set('start', start)
        if (end) params.set('end', end)
        const res = await fetch(`/api/analytics/reps/${selectedRep.user_id}?${params.toString()}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Failed to load rep detail')
        setDetail(json as RepDetailData)
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : 'Failed to load rep detail')
      } finally {
        setDetailLoading(false)
      }
    }
    void loadDetail()
  }, [selectedRep, start, end])

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

  const metric = (r: RepRow) => callView === 'unique' ? r.unique_leads : r.calls
  const sorted = [...reps].sort((a, b) => metric(b) - metric(a))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {reps.length} rep{reps.length !== 1 ? 's' : ''} · ranked by {callView === 'unique' ? 'leads called' : 'call volume'}
        </p>
        <div className="flex items-center rounded-lg border border-border p-0.5 text-xs font-medium">
          {([['unique', 'Per person'], ['all', 'All calls']] as const).map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              onClick={() => setCallView(v)}
              className={cn(
                'rounded-md px-2.5 py-1 transition-colors whitespace-nowrap',
                callView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {sorted.map((rep, i) => (
          <RepCard key={rep.user_id} rep={rep} rank={i + 1} callView={callView} onOpen={setSelectedRep} />
        ))}
      </div>

      {selectedRep && (
        <RepDetailDrawer
          rep={selectedRep}
          onClose={() => setSelectedRep(null)}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          showMoreFollowUps={showMoreFollowUps}
          setShowMoreFollowUps={setShowMoreFollowUps}
          showMoreCalls={showMoreCalls}
          setShowMoreCalls={setShowMoreCalls}
        />
      )}
    </div>
  )
}
