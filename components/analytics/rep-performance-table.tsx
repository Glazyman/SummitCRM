'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Users, Phone, Clock, CheckCircle2, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { RepRow, CallOverview } from './types'

type Metric = 'unique_leads' | 'calls' | 'calls_answered' | 'interested_marked' | 'follow_ups_completed' | 'follow_ups_overdue' | 'active_days' | 'answer_rate'
const name = (rep: RepRow) => rep.full_name || rep.user_email
const answerRate = (rep: RepRow) => rep.calls ? rep.calls_answered / rep.calls * 100 : 0
const metricValue = (rep: RepRow, metric: Metric) => metric === 'answer_rate' ? answerRate(rep) : rep[metric] ?? 0
const format = (value: number) => value.toLocaleString()
const outcomeLabel: Record<string, string> = { answered: 'Answered', voicemail: 'Voicemail', no_answer: 'No answer', wrong_number: 'Wrong number', callback_requested: 'Callback requested' }
const outcomes = [
  ['Answered', 'calls_answered', '#4b8f7a'], ['Voicemail', 'calls_voicemail', '#7c6aa7'],
  ['No answer', 'calls_no_answer', '#94a3b8'], ['Wrong number', 'calls_wrong_number', '#b56a6a'],
  ['Callback', 'calls_callback', '#d09b45'],
] as const

export function RepPerformanceTable({ reps, overview, loading, start, end }: { reps: RepRow[]; overview: CallOverview; loading?: boolean; start?: string; end?: string }) {
  const [search, setSearch] = React.useState('')
  const [activeOnly, setActiveOnly] = React.useState(false)
  const [sort, setSort] = React.useState<Metric>('unique_leads')
  const [descending, setDescending] = React.useState(true)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const selected = reps.find(rep => rep.user_id === selectedId)
  const active = (rep: RepRow) => rep.calls > 0 || (rep.interested_marked ?? 0) > 0 || rep.follow_ups_completed > 0
  const visible = reps.filter(rep => name(rep).toLowerCase().includes(search.toLowerCase()) && (!activeOnly || active(rep)))
    .sort((a, b) => (metricValue(b, sort) - metricValue(a, sort)) * (descending ? 1 : -1) || name(a).localeCompare(name(b)))
  const currentReps = reps.filter(rep => rep.role !== 'historical')
  const calls = overview.unique_leads
  const answered = overview.answered
  const overdue = reps.reduce((sum, rep) => sum + rep.follow_ups_overdue, 0)
  const completed = reps.reduce((sum, rep) => sum + rep.follow_ups_completed, 0)
  function changeSort(metric: Metric) { if (sort === metric) setDescending(!descending); else { setSort(metric); setDescending(true) } }
  const columns: { label: string; metric: Metric; hint: string }[] = [
    { label: 'Leads called', metric: 'unique_leads', hint: 'Leads whose first call by this rep falls in the selected period' },
    { label: 'Answer rate', metric: 'answer_rate', hint: 'Answered leads divided by leads called' },
    { label: 'Interested', metric: 'interested_marked', hint: 'Distinct leads marked interested by this rep in the period' },
    { label: 'Tasks done', metric: 'follow_ups_completed', hint: 'Follow-ups completed in the selected period' },
    { label: 'Active days', metric: 'active_days', hint: 'Calendar days with at least one logged call, in your timezone' },
    { label: 'Overdue now', metric: 'follow_ups_overdue', hint: 'Current overdue tasks; independent of the selected dates' },
  ]
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        { label: 'Active teammates', value: `${currentReps.filter(active).length} / ${currentReps.length}`, note: 'Calls, interest changes, or tasks completed' },
        { label: 'Team answer rate', value: calls ? `${Math.round(answered / calls * 100)}%` : '—', note: `${format(answered)} answered of ${format(calls)} leads called` },
        { label: 'Follow-ups completed', value: format(completed), note: 'Completed in the selected period' },
        { label: 'Overdue tasks now', value: format(overdue), note: 'Current workload across the team' },
      ].map(item => <div key={item.label} className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '…' : item.value}</p><p className="mt-1 text-xs text-muted-foreground">{loading ? 'Loading…' : item.note}</p></div>)}
    </div>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div><h2 className="text-sm font-semibold">Team performance</h2><p className="mt-1 text-xs text-muted-foreground">Each lead counts once, on its first call date. Select a rep to see their calls and tasks.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><input aria-label="Find a teammate" placeholder="Find a teammate…" value={search} onChange={e => setSearch(e.target.value)} className="h-9 w-44 rounded-lg border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring" /></div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />With activity only</label>
        </div>
      </div>
      <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-sm">
        <thead className="border-b bg-muted/35 text-xs text-muted-foreground"><tr>
          <th scope="col" className="px-5 py-3 text-left font-medium">Teammate</th>
          {columns.map(column => <th key={column.metric} scope="col" aria-sort={sort === column.metric ? descending ? 'descending' : 'ascending' : 'none'} className="px-3 py-3 text-right font-medium"><button type="button" title={column.hint} onClick={() => changeSort(column.metric)} className="inline-flex items-center gap-1 hover:text-foreground">{column.label}{sort === column.metric ? descending ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}</button></th>)}
          <th scope="col" className="px-4 py-3 text-right font-medium">Assigned now</th>
        </tr></thead>
        <tbody className="divide-y divide-border">{!loading && visible.map((rep, index) => <tr key={rep.user_id} className="group hover:bg-muted/25">
          <th scope="row" className="px-5 py-4 text-left font-normal"><button type="button" aria-label={`View ${name(rep)} performance`} disabled={rep.user_id === 'unattributed'} onClick={() => setSelectedId(rep.user_id)} className="flex w-full items-center gap-3 text-left">
            <span className="w-4 text-xs tabular-nums text-muted-foreground">{index + 1}</span><span className="min-w-0"><span className="flex items-center gap-2 font-medium">{name(rep)}{rep.role === 'historical' && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Historical</span>}<ChevronRight className="h-3 w-3 text-muted-foreground" /></span><span className="mt-1 block text-[11px] font-normal text-muted-foreground">{rep.last_call_at ? `Last call ${new Date(rep.last_call_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'No calls in this period'}</span></span>
          </button></th>
          {columns.map(column => <td key={column.metric} className={cn('px-3 py-4 text-right tabular-nums', column.metric === 'follow_ups_overdue' && rep.follow_ups_overdue > 0 && 'font-medium text-destructive')}>
            {rep.role === 'historical' && column.metric === 'follow_ups_overdue' ? '—' : column.metric === 'answer_rate' ? rep.calls ? `${Math.round(answerRate(rep))}%` : '—' : format(metricValue(rep, column.metric))}
          </td>)}
          <td className="px-4 py-4 text-right tabular-nums">{rep.role === 'historical' ? <span className="text-muted-foreground">—</span> : <><span>{format(rep.leads_assigned)}</span><span className="mt-1 block text-[11px] text-muted-foreground">{format(rep.leads_new)} new</span></>}</td>
        </tr>)}</tbody>
      </table></div>
      {loading && <div role="status" className="space-y-3 p-5">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>}
      {!loading && !visible.length && <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground"><Users className="h-6 w-6" />No teammates match these filters.</div>}
      <div className="flex flex-wrap justify-between gap-2 border-t px-5 py-3 text-xs text-muted-foreground"><span>{visible.length} of {reps.length} teammates · counts use the selected period</span><span>Assigned and overdue counts show the current workload.</span></div>
    </div>
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5"><h2 className="text-sm font-semibold">Call outcomes by rep</h2><p className="mt-1 text-xs text-muted-foreground">Each bar shows the outcomes of first calls for that teammate.</p>
      <div className="mt-4 space-y-4">{loading ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : visible.filter(rep => rep.calls > 0).map(rep => <div key={rep.user_id} className="grid gap-2 sm:grid-cols-[160px_1fr_70px] sm:items-center"><span className="truncate text-xs font-medium">{name(rep)}</span><div className="flex h-4 overflow-hidden rounded-full bg-muted" aria-label={`${name(rep)} call outcomes`}>{outcomes.map(([label, key, color]) => <div key={key} title={`${label}: ${rep[key] ?? 0}`} style={{ width: `${(rep[key] ?? 0) / rep.calls * 100}%`, background: color }} />)}</div><span className="text-right text-xs tabular-nums text-muted-foreground">{format(rep.calls)} leads</span></div>)}</div>
      <div className="mt-4 flex flex-wrap gap-4">{outcomes.map(([label, , color]) => <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span>)}</div>
    </div>
    <p className="text-xs text-muted-foreground">Interest changes are recorded from October 21, 2026. A lead counts once per rep in the selected period; team totals can differ when multiple reps work the same lead. Historical contributors are included for complete coverage; their current workload is not shown.</p>
    {selected && <RepDetails key={`${selected.user_id}:${start}:${end}`} rep={selected} start={start} end={end} onClose={() => setSelectedId(null)} />}
  </div>
}

interface Lead { id?: string; first_name: string | null; last_name: string | null; company: string | null; email: string }
interface Detail {
  calls: { id: string; lead_id?: string; outcome: string; called_at: string; notes: string | null; lead: Lead | null }[]
  followUps: { id: string; lead_id?: string; title: string; due_at: string | null; completed_at: string | null; notes: string | null; lead: Lead | null }[]
}
function RepDetails({ rep, start, end, onClose }: { rep: RepRow; start?: string; end?: string; onClose: () => void }) {
  const [data, setData] = React.useState<Detail | null>(null)
  const [error, setError] = React.useState('')
  const [tab, setTab] = React.useState<'calls' | 'open' | 'completed'>('calls')
  const [visibleCount, setVisibleCount] = React.useState(30)
  React.useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    fetch(`/api/analytics/reps/${rep.user_id}?${params}`, { signal: controller.signal }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load rep details')
      setData(result)
    }).catch(err => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [rep.user_id, start, end])
  const tasks = data?.followUps.filter(task => tab === 'completed' ? !!task.completed_at : !task.completed_at) ?? []
  const leadTitle = (lead: Lead | null) => lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company || lead.email : 'Unavailable lead'
  return <Dialog open onClose={onClose}><DialogContent size="xl" aria-label={`${name(rep)} performance detail`} className="max-h-[88vh] w-[calc(100%-2rem)] p-0">
    <div className="border-b p-5 pr-12"><p className="text-xs text-muted-foreground">Rep performance · selected period</p><h2 className="mt-1 text-lg font-semibold">{name(rep)}</h2><p className="mt-1 text-xs text-muted-foreground">{rep.user_email}</p></div>
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-3 gap-2">{[['Leads called', rep.unique_leads], ['Answered', rep.calls_answered], ['Interested', rep.interested_marked ?? 0]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}</div>
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">{([['calls', Phone, 'Leads called'], ['open', Clock, 'Open tasks now'], ['completed', CheckCircle2, 'Completed in period']] as const).map(([value, Icon, label]) => <button key={value} type="button" onClick={() => { setTab(value); setVisibleCount(30) }} className={cn('flex items-center gap-1.5 rounded-md px-3 py-2 text-xs', tab === value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : !data ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading details…</p> : <div className="max-h-[45vh] space-y-2 overflow-y-auto">
        {tab === 'calls' ? data.calls.length ? <><p className="text-xs text-muted-foreground">Showing {Math.min(visibleCount, data.calls.length)} of {rep.calls} leads called in this period.</p>{data.calls.slice(0, visibleCount).map(call => <div key={call.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><div><Link prefetch={false} className="text-sm font-medium hover:underline" href={`/leads/${call.lead_id}`}>{leadTitle(call.lead)}</Link><p className="text-xs text-muted-foreground">{call.lead?.company}</p></div><span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px]">{outcomeLabel[call.outcome] || call.outcome}</span></div><p className="mt-2 text-[11px] text-muted-foreground">{new Date(call.called_at).toLocaleString()}</p>{call.notes && <p className="mt-2 whitespace-pre-wrap text-xs">{call.notes}</p>}</div>)}</> : <p className="py-8 text-center text-sm text-muted-foreground">No calls in this period.</p> : tasks.length ? <><p className="text-xs text-muted-foreground">Showing {Math.min(visibleCount, tasks.length)} of {tasks.length} tasks{data.followUps.length >= 500 ? ' · latest 500 task records loaded' : ''}.</p>{tasks.slice(0, visibleCount).map(task => <div key={task.id} className="rounded-lg border p-3"><Link prefetch={false} className="text-sm font-medium hover:underline" href={`/leads/${task.lead_id}`}>{leadTitle(task.lead)}</Link><p className="mt-1 text-xs">{task.title}</p><p className="mt-2 text-[11px] text-muted-foreground">{task.completed_at ? `Completed ${new Date(task.completed_at).toLocaleString()}` : task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : 'No due date'}</p>{task.notes && <p className="mt-2 whitespace-pre-wrap text-xs">{task.notes}</p>}</div>)}</> : <p className="py-8 text-center text-sm text-muted-foreground">No {tab === 'open' ? 'open tasks' : 'completed tasks in this period'}.</p>}
        {((tab === 'calls' ? data.calls.length : tasks.length) > visibleCount) && <button type="button" className="w-full rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted" onClick={() => setVisibleCount(value => value + 30)}>Show more</button>}
      </div>}
    </div>
  </DialogContent></Dialog>
}
