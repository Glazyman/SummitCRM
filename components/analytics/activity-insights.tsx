'use client'

import { BarChart, Bar, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { CallOverview, RepRow } from './types'

export interface ActivityDay { date: string; calls: number; unique_leads: number; interested: number }

export function ActivityInsights({ overview, reps, daily, loading }: { overview: CallOverview; reps: RepRow[]; daily: ActivityDay[]; loading: boolean }) {
  const summary = [
    { label: 'Leads called', value: overview.unique_leads, detail: 'First call only · each lead counts once' },
    { label: 'Answer rate', value: overview.total ? `${Math.round(overview.answered / overview.total * 100)}%` : '—', detail: 'Outcome of each lead’s first call' },
    { label: 'Interested now', value: overview.interested, detail: 'Current interested leads · all dates' },
    { label: 'Follow-ups completed', value: overview.follow_ups_completed ?? 0, detail: 'Completed within the selected period' },
  ]
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {summary.map(s => <div key={s.label} className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{loading ? '…' : s.value.toLocaleString()}</p>
        <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
      </div>)}
    </div>
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold">Activity by day</h2>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">Days with recorded activity · your local timezone · leads counted on their first call date</p>
      {loading ? <div className="h-56 animate-pulse rounded-lg bg-muted" /> : daily.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No activity recorded in this period.</p> : <ResponsiveContainer width="100%" height={240}>
        <BarChart data={daily} maxBarSize={36} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} tickFormatter={v => new Date(`${v}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={v => new Date(`${v}T12:00`).toLocaleDateString()} contentStyle={{ borderRadius: 10, fontSize: 12, background: 'var(--card)', borderColor: 'var(--border)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="unique_leads" name="Leads called" fill="#4b8f7a" radius={[3, 3, 0, 0]} />
          <Bar dataKey="interested" name="Recorded interest changes" fill="#d09b45" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>}
    </div>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="px-4 py-4"><h2 className="text-sm font-semibold">Rep comparison</h2><p className="mt-1 text-xs text-muted-foreground">Selected period · sorted by unique leads called. Full details are in Rep Performance.</p></div>
      <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-sm">
        <thead className="border-y bg-muted/40 text-xs text-muted-foreground"><tr>{['Rep', 'Leads called', 'Answered', 'Answer rate', 'Interested now', 'Follow-ups done'].map(h => <th key={h} scope="col" className="px-4 py-3 text-right font-medium first:text-left">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{!loading && [...reps].sort((a, b) => b.unique_leads - a.unique_leads).map(r => <tr key={r.user_id} className="hover:bg-muted/30">
          <th scope="row" className="px-4 py-3 text-left font-medium">{r.full_name || r.user_email}</th>
          {[r.unique_leads, r.calls_answered, r.calls ? `${Math.round(r.calls_answered / r.calls * 100)}%` : '—', r.interested_current ?? 0, r.follow_ups_completed].map((v, i) => <td key={i} className="px-4 py-3 text-right tabular-nums">{v}</td>)}
        </tr>)}</tbody>
      </table></div>
      {loading && <p className="p-4 text-sm text-muted-foreground">Loading performance…</p>}
      {!loading && !reps.length && <p className="p-4 text-sm text-muted-foreground">No rep data available.</p>}
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">Each lead counts once, on its first call date. Answer rate uses first-call outcomes. Interested now shows currently assigned interested leads, independent of dates. Interest-change history is available only from October 21, 2026; repeat markings of the same lead count once per period.</p>
    </div>
  </div>
}
