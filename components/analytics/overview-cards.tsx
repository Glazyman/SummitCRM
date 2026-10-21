'use client'
import React from 'react'
import type { CallOverview, RepRow } from './types'
import { Card, CardContent } from '@/components/ui/card'
import { Phone, Calendar, Users, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/pie-chart'
const OUTCOME_COLORS: Record<string, string> = {
  answered:  '#10b981',
  voicemail: '#a855f7',
  no_answer: '#94a3b8',
  wrong:     '#ef4444',
  callback:  '#f59e0b',
}

// ── Call-outcome donut ────────────────────────────────────────────────────
// A clean donut wheel: each outcome is one ring slice, sized by its share of
// total calls. Centre shows the headline figure (unique leads called).
function CallDonut({
  data, centerValue, centerLabel,
}: {
  data: { name: string; value: number; color: string }[]
  centerValue: React.ReactNode
  centerLabel: string
}) {
  return (
    <div className="relative self-center [&_path]:!outline-none">
      <ResponsiveContainer width="100%" height={196}>
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="50%"
            innerRadius={56} outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            strokeWidth={0}
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <RTooltip
            formatter={(v, n) => [String(v), String(n)]}
            contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', background: 'hsl(var(--popover))' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Pinned to the chart height (196px), not the wrapper — the wrapper can
          be stretched taller by the grid row, which would push this below the
          donut hole. top-0 h-[196px] keeps it centered in the ring. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[196px] flex flex-col items-center justify-center">
        <span className="text-xl font-bold leading-none">{centerValue}</span>
        <span className="mt-0.5 text-[10px] text-muted-foreground text-center px-2 leading-tight">{centerLabel}</span>
      </div>
    </div>
  )
}

// ── Overview summary cards ────────────────────────────────────────────────
export function OverviewCards({ overview, loading, reps }: { overview: CallOverview; loading: boolean; reps: RepRow[] }) {
  const answerRate = overview.total > 0 ? Math.round(overview.answered / overview.total * 100) : 0
  const donutData = [
    { name: 'Answered',  value: overview.answered,     color: OUTCOME_COLORS.answered  },
    { name: 'Voicemail', value: overview.voicemail,    color: OUTCOME_COLORS.voicemail },
    { name: 'No Answer', value: overview.no_answer,    color: OUTCOME_COLORS.no_answer },
    { name: 'Wrong #',   value: overview.wrong_number, color: OUTCOME_COLORS.wrong     },
    { name: 'Callback',  value: overview.callback,     color: OUTCOME_COLORS.callback  },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
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
              {/* Call-outcome donut */}
              {donutData.length > 0 ? (
                <CallDonut
                  data={donutData}
                  centerValue={overview.unique_leads}
                  centerLabel="leads called"
                />
              ) : (
                <div className="flex h-[196px] items-center justify-center text-sm text-muted-foreground">
                  No calls in this period.
                </div>
              )}
              {/* Breakdown */}
              <div className="flex flex-col justify-center space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Call outcomes · % of {overview.total.toLocaleString()} {overview.total === 1 ? 'lead' : 'leads'} · first call
                </p>
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

                {/* Lead status — current snapshot, not call outcomes */}
                <div className="mt-1 border-t border-border pt-2.5 space-y-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Current lead status · % of all leads</p>
                  {([
                    { label: 'Interested',     value: overview.interested,     dot: 'bg-emerald-500' },
                    { label: 'Not interested', value: overview.not_interested, dot: 'bg-muted-foreground/50' },
                    { label: 'Bad leads',      value: overview.bad_leads,      dot: 'bg-destructive' },
                  ] as const).map(s => (
                    <div key={s.label} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', s.dot)} />
                        <span className="text-muted-foreground">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{s.value}</span>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">
                          {overview.leads_total > 0 ? `${(s.value / overview.leads_total * 100).toFixed(1)}%` : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
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
                <p className="text-xs text-muted-foreground mt-1">{overview.answered} answered of {overview.total} leads called</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current workload</span>
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

      {/* Calls by rep — bar chart (reps on x-axis, calls on y-axis) */}
      {reps.length > 0 && <RepCallsChart reps={reps} loading={loading} />}
    </div>
  )
}

// ── Calls-by-rep bar chart (reui/shadcn chart style) ──────────────────────
function RepCallsChart({ reps, loading }: { reps: RepRow[]; loading: boolean }) {
  // y-axis = UNIQUE leads called per rep (one per lead, the "54" logic), not
  // raw call dials (the "65"). Matches the per-person framing elsewhere.
  const data = [...reps]
    .map(r => ({ rep: (r.full_name ?? r.user_email)?.split(' ')[0] ?? '—', leads: r.unique_leads }))
    .sort((a, b) => b.leads - a.leads)
  const chartConfig = { leads: { label: 'Leads called', color: '#4b8f7a' } } satisfies ChartConfig

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-4">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Leads Called by Rep</span>
        </div>
        {loading ? (
          <div className="h-[260px] animate-pulse bg-muted rounded-xl" />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
            <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="rep" tickLine={false} axisLine={false} tickMargin={8} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 48 : 24} />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent nameKey="leads" />} />
              <Bar dataKey="leads" fill="var(--color-leads)" radius={[6, 6, 0, 0]} maxBarSize={64} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

