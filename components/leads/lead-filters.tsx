'use client'

import * as React from 'react'
import { Search, X, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectMenu } from '@/components/ui/select-menu'
import { CalendarPicker } from '@/components/ui/calendar-picker'
import { todayYmd, shiftYmd } from '@/components/ui/day-nav'
import { INTEREST_CONFIG, ALL_INTEREST_STATUSES } from './status-config'
import type { LeadFilters, InterestStatus } from './types'

interface FilterBatch  { id: string; name: string }
interface FilterMember { id: string; name: string }

interface LeadFiltersProps {
  filters:     LeadFilters
  batches:     FilterBatch[]
  teamMembers: FilterMember[]
  isAdmin:     boolean
  isRep?:      boolean
  onChange:    (patch: Partial<LeadFilters>) => void
  onClear:     () => void
}

// Above this many reps the rep filter falls back to a searchable menu —
// a row of 20 pills is slower to scan than a list.
const MAX_REP_PILLS = 6

type AddedPreset = 'any' | 'today' | '7d' | '30d' | 'custom'

function addedPresetOf(from: string, to: string): AddedPreset {
  const today = todayYmd()
  if (!from && !to) return 'any'
  if (from === today && to === today) return 'today'
  if (!to && from === shiftYmd(today, -6))  return '7d'
  if (!to && from === shiftYmd(today, -29)) return '30d'
  return 'custom'
}

/**
 * Leads filters, all visible on the page (no Filters dropdown). Status lives
 * in the LeadStatusBar above; this row adds interest, rep, batch and the
 * "added" (created) date — each one click.
 */
export function LeadFiltersPanel({
  filters,
  batches,
  teamMembers,
  isAdmin,
  isRep,
  onChange,
  onClear,
}: LeadFiltersProps) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [customDates, setCustomDates] = React.useState(false)

  // Debounced search
  const [localSearch, setLocalSearch] = React.useState(filters.search)
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function handleSearch(v: string) {
    setLocalSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => onChange({ search: v, page: 1 }), 300)
  }

  const hasActiveFilters =
    filters.statuses.length > 0 || filters.interests.length > 0 || !!filters.batchId ||
    !!filters.assignedTo || filters.coldOnly || !!filters.dateFrom || !!filters.dateTo ||
    filters.myLeads || !!filters.search

  function toggleInterest(interest: InterestStatus) {
    const next = filters.interests.includes(interest)
      ? filters.interests.filter((s) => s !== interest)
      : [...filters.interests, interest]
    onChange({ interests: next, page: 1 })
  }

  const added = addedPresetOf(filters.dateFrom, filters.dateTo)
  const showCustom = customDates || added === 'custom'
  function setAdded(p: AddedPreset) {
    const today = todayYmd()
    setCustomDates(p === 'custom')
    if (p === 'any')   onChange({ dateFrom: '', dateTo: '', page: 1 })
    if (p === 'today') onChange({ dateFrom: today, dateTo: today, page: 1 })
    if (p === '7d')    onChange({ dateFrom: shiftYmd(today, -6),  dateTo: '', page: 1 })
    if (p === '30d')   onChange({ dateFrom: shiftYmd(today, -29), dateTo: '', page: 1 })
  }

  const pill = (active: boolean) => cn(
    'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-all',
    active
      ? 'border-primary/50 bg-primary/10 text-primary shadow-sm'
      : 'border-border bg-background text-muted-foreground hover:text-foreground hover:shadow-sm',
  )
  const groupLabel = 'mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70'

  return (
    <div className="space-y-3">

      {/* ── Search row ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={localSearch}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search name, email, or company…"
            className={cn(
              'h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm',
              'placeholder:text-muted-foreground transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              // type="search" gets a native ✕ from WebKit/Chromium — hide it,
              // we render our own clear button below.
              '[&::-webkit-search-cancel-button]:hidden',
            )}
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => { setLocalSearch(''); onChange({ search: '', page: 1 }); searchRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!isRep && (
            <button
              type="button"
              onClick={() => onChange({ myLeads: !filters.myLeads, page: 1 })}
              className={cn(pill(filters.myLeads), 'h-9 text-sm')}
            >
              <User className="h-3.5 w-3.5" />
              My Leads
            </button>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setLocalSearch(''); setCustomDates(false); onClear() }}
              className="flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-sm text-muted-foreground transition-all hover:shadow-sm"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* ── Quick filters — always on the page ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">

        {/* Interest */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={groupLabel}>Interest</span>
          {ALL_INTEREST_STATUSES.map((interest) => {
            const meta   = INTEREST_CONFIG[interest]
            const active = filters.interests.includes(interest)
            return (
              <button
                key={interest}
                type="button"
                onClick={() => toggleInterest(interest)}
                className={cn(pill(false), active && cn(meta.badge, 'shadow-sm'))}
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? meta.dot : 'bg-current opacity-40')} />
                {meta.label}
              </button>
            )
          })}
        </div>

        {/* Rep (admin) */}
        {isAdmin && teamMembers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={groupLabel}>Rep</span>
            {teamMembers.length <= MAX_REP_PILLS ? (
              <>
                <button type="button" className={pill(!filters.assignedTo)} onClick={() => onChange({ assignedTo: null, page: 1 })}>
                  All
                </button>
                {teamMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={pill(filters.assignedTo === m.id)}
                    onClick={() => onChange({ assignedTo: filters.assignedTo === m.id ? null : m.id, page: 1 })}
                  >
                    {m.name.split(' ')[0]}
                  </button>
                ))}
                <button
                  type="button"
                  className={pill(filters.assignedTo === 'unassigned')}
                  onClick={() => onChange({ assignedTo: filters.assignedTo === 'unassigned' ? null : 'unassigned', page: 1 })}
                >
                  Unassigned
                </button>
              </>
            ) : (
              <SelectMenu
                value={filters.assignedTo ?? ''}
                onChange={(v) => onChange({ assignedTo: v || null, page: 1 })}
                nullable
                nullLabel="All reps"
                size="sm"
                searchable
                options={[
                  { value: 'unassigned', label: 'Unassigned' },
                  ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
                ]}
                className="w-40"
              />
            )}
          </div>
        )}

        {/* Batch */}
        {batches.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={groupLabel}>Batch</span>
            <SelectMenu
              value={filters.batchId ?? ''}
              onChange={(v) => onChange({ batchId: v || null, page: 1 })}
              nullable
              nullLabel="All batches"
              size="sm"
              searchable={batches.length > 6}
              options={batches.map((b) => ({ value: b.id, label: b.name }))}
              className="w-44"
            />
          </div>
        )}

        {/* Added (lead created) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={groupLabel}>Added</span>
          {([
            ['any',    'Any time'],
            ['today',  'Today'],
            ['7d',     '7 days'],
            ['30d',    '30 days'],
            ['custom', 'Custom'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={pill(value === 'custom' ? showCustom : !showCustom && added === value)}
              onClick={() => setAdded(value)}
            >
              {label}
            </button>
          ))}
          {showCustom && (
            <div className="flex items-center gap-1.5">
              <div className="w-36">
                <CalendarPicker value={filters.dateFrom} onChange={(v) => onChange({ dateFrom: v, page: 1 })} className="h-8" />
              </div>
              <span className="text-xs text-muted-foreground">→</span>
              <div className="w-36">
                <CalendarPicker value={filters.dateTo} onChange={(v) => onChange({ dateTo: v, page: 1 })} className="h-8" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
