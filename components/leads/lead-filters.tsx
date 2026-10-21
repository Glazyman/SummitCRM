'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectMenu } from '@/components/ui/select-menu'
import { CalendarPicker } from '@/components/ui/calendar-picker'
import { todayYmd, dayRange, shiftYmd } from '@/components/ui/day-nav'
import { INTEREST_CONFIG, ALL_INTEREST_STATUSES } from './status-config'
import type { LeadFilters } from './types'

interface Props {
  filters: LeadFilters
  batches: { id: string; name: string }[]
  teamMembers: { id: string; name: string }[]
  isAdmin: boolean
  isRep?: boolean
  onChange: (patch: Partial<LeadFilters>) => void
  onClear: () => void
}

export function LeadFiltersPanel({ filters: f, batches, teamMembers, isAdmin, isRep, onChange, onClear }: Props) {
  const [search, setSearch] = React.useState(f.search)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [previousSearch, setPreviousSearch] = React.useState(f.search)
  if (previousSearch !== f.search) { setPreviousSearch(f.search); setSearch(f.search) }
  React.useEffect(() => () => clearTimeout(timer.current), [])
  const change = (patch: Partial<LeadFilters>) => onChange({ ...patch, page: 1 })
  const today = dayRange(todayYmd())
  const interestedToday = f.interestedStart === today.start && f.interestedEnd === today.end
  const pill = (active: boolean) => cn('h-8 shrink-0 rounded-md border px-3 text-xs font-medium transition-colors', active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground')
  const active = !!(f.search || f.statuses.length || f.interests.length || f.batchId || f.assignedTo || f.myLeads || f.coldOnly || f.dateFrom || f.dateTo || f.interestedStart)
  const field = 'space-y-1.5 min-w-0'
  const label = 'block text-[11px] font-medium text-muted-foreground'
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input type="search" aria-label="Search leads" value={search} placeholder="Search name, company, or email…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
            onChange={e => { const value = e.target.value; setSearch(value); clearTimeout(timer.current); timer.current = setTimeout(() => change({ search: value }), 300) }} />
          {search && <button type="button" aria-label="Clear search" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => { clearTimeout(timer.current); setSearch(''); change({ search: '' }) }}><X className="h-4 w-4" /></button>}
        </div>
        {active && <button type="button" className="shrink-0 text-xs text-muted-foreground hover:text-foreground" onClick={() => { clearTimeout(timer.current); setSearch(''); onClear() }}>Clear all</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="Quick lead filters">
        <span className="mr-1 text-xs text-muted-foreground">Quick filters</span>
        <button type="button" aria-pressed={interestedToday} className={pill(interestedToday)} title="Leads marked interested today, based on recorded interest changes" onClick={() => change({ interestedStart: interestedToday ? '' : today.start, interestedEnd: interestedToday ? '' : today.end, interests: [], statuses: [], coldOnly: false })}>Interested today</button>
        <button type="button" aria-pressed={f.interests.length === 1 && f.interests[0] === 'interested' && !f.interestedStart} className={pill(f.interests.length === 1 && f.interests[0] === 'interested' && !f.interestedStart)} onClick={() => change({ interests: f.interests.length === 1 && f.interests[0] === 'interested' && !f.interestedStart ? [] : ['interested'], interestedStart: '', interestedEnd: '', coldOnly: false })}>All interested</button>
        <button type="button" aria-pressed={f.statuses.length === 1 && f.statuses[0] === 'new'} className={pill(f.statuses.length === 1 && f.statuses[0] === 'new')} onClick={() => change({ statuses: f.statuses.length === 1 && f.statuses[0] === 'new' ? [] : ['new'], interestedStart: '', interestedEnd: '', coldOnly: false })}>New leads</button>
        <button type="button" aria-pressed={f.statuses.length === 2 && f.statuses.includes('no_answer') && f.statuses.includes('voicemail')} className={pill(f.statuses.length === 2 && f.statuses.includes('no_answer') && f.statuses.includes('voicemail'))} onClick={() => change({ statuses: f.statuses.length === 2 && f.statuses.includes('no_answer') && f.statuses.includes('voicemail') ? [] : ['no_answer', 'voicemail'], interestedStart: '', interestedEnd: '', coldOnly: false })}>Try again</button>
        {!isRep && <button type="button" aria-pressed={f.myLeads} className={pill(f.myLeads)} onClick={() => change({ myLeads: !f.myLeads, assignedTo: null })}>My leads</button>}
        {isAdmin && <button type="button" aria-pressed={f.assignedTo === 'unassigned'} className={pill(f.assignedTo === 'unassigned')} onClick={() => change({ assignedTo: f.assignedTo === 'unassigned' ? null : 'unassigned', myLeads: false })}>Unassigned</button>}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-3 xl:grid-cols-5">
        <div className={field}><span className={label}>Interest</span>
          <SelectMenu value={f.interests.length === 1 ? f.interests[0] : ''} nullable nullLabel={f.interests.length > 1 ? `${f.interests.length} selected` : 'Any interest'} size="sm" options={ALL_INTEREST_STATUSES.map(v => ({ value: v, label: INTEREST_CONFIG[v].label }))} onChange={v => change({ interests: v ? [v as LeadFilters['interests'][number]] : [] })} className="w-full" />
        </div>
        {isAdmin && <div className={field}><span className={label}>Assigned to</span><SelectMenu value={f.assignedTo ?? ''} nullable nullLabel="All reps" size="sm" searchable options={[{ value: 'unassigned', label: 'Unassigned' }, ...teamMembers.map(m => ({ value: m.id, label: m.name }))]} onChange={v => change({ assignedTo: v || null, myLeads: false })} className="w-full" /></div>}
        {batches.length > 0 && <div className={field}><span className={label}>Batch</span><SelectMenu value={f.batchId ?? ''} nullable nullLabel="All batches" size="sm" searchable options={batches.map(b => ({ value: b.id, label: b.name }))} onChange={v => change({ batchId: v || null })} className="w-full" /></div>}
        <div className={field}><span className={label}>Added from</span><CalendarPicker value={f.dateFrom} onChange={v => change({ dateFrom: v })} className="h-8 w-full" /></div>
        <div className={field}><span className={label}>Added through</span><CalendarPicker value={f.dateTo} onChange={v => change({ dateTo: v })} className="h-8 w-full" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Added:</span>
        {[['Today', todayYmd()], ['Last 7 days', shiftYmd(todayYmd(), -6)], ['Last 30 days', shiftYmd(todayYmd(), -29)]].map(([label, from]) => <button key={label} type="button" className="hover:text-foreground hover:underline" onClick={() => change({ dateFrom: from, dateTo: todayYmd() })}>{label}</button>)}
        {(f.dateFrom || f.dateTo) && <button type="button" onClick={() => change({ dateFrom: '', dateTo: '' })}>Any time ×</button>}
      </div>
      {f.interestedStart && <p className="text-xs text-muted-foreground">Marked interested today · recorded changes only; earlier interest history was not captured.</p>}
    </div>
  )
}
