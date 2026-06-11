'use client'

import * as React from 'react'
import { Search, X, SlidersHorizontal, ChevronDown, User, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectMenu } from '@/components/ui/select-menu'
import { CalendarPicker } from '@/components/ui/calendar-picker'
import { STATUS_CONFIG, ALL_STATUSES, INTEREST_CONFIG, ALL_INTEREST_STATUSES } from './status-config'
import type { LeadFilters, LeadStatus, InterestStatus } from './types'

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

export function LeadFiltersPanel({
  filters,
  batches,
  teamMembers,
  isAdmin,
  isRep,
  onChange,
  onClear,
}: LeadFiltersProps) {
  const [expanded, setExpanded] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement>(null)

  // Debounced search
  const [localSearch, setLocalSearch] = React.useState(filters.search)
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function handleSearch(v: string) {
    setLocalSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => onChange({ search: v, page: 1 }), 300)
  }

  // Count active filters (for the badge)
  const activeFilterCount = [
    filters.statuses.length > 0,
    filters.interests.length > 0,
    !!filters.batchId,
    !!filters.assignedTo,
    filters.coldOnly,
    !!filters.dateFrom || !!filters.dateTo,
    filters.myLeads,
  ].filter(Boolean).length

  const hasActiveFilters = activeFilterCount > 0

  function toggleStatus(status: LeadStatus) {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status]
    onChange({ statuses: next, page: 1 })
  }

  function toggleInterest(interest: InterestStatus) {
    const next = filters.interests.includes(interest)
      ? filters.interests.filter((s) => s !== interest)
      : [...filters.interests, interest]
    onChange({ interests: next, page: 1 })
  }

  // Active filter chips (shown below the top bar when filters are on but panel is collapsed)
  const activeChips: { label: string; onRemove: () => void }[] = []

  if (filters.myLeads) {
    activeChips.push({ label: 'My Leads', onRemove: () => onChange({ myLeads: false, page: 1 }) })
  }
  if (filters.statuses.length > 0) {
    if (filters.statuses.length === 1) {
      activeChips.push({
        label: STATUS_CONFIG[filters.statuses[0]].label,
        onRemove: () => onChange({ statuses: [], page: 1 }),
      })
    } else {
      activeChips.push({
        label: `${filters.statuses.length} statuses`,
        onRemove: () => onChange({ statuses: [], page: 1 }),
      })
    }
  }

  if (filters.interests.length > 0) {
    if (filters.interests.length === 1) {
      activeChips.push({
        label: INTEREST_CONFIG[filters.interests[0]].label,
        onRemove: () => onChange({ interests: [], page: 1 }),
      })
    } else {
      activeChips.push({
        label: `${filters.interests.length} interests`,
        onRemove: () => onChange({ interests: [], page: 1 }),
      })
    }
  }
  if (filters.batchId) {
    const name = batches.find((b) => b.id === filters.batchId)?.name ?? 'Batch'
    activeChips.push({ label: name, onRemove: () => onChange({ batchId: null, page: 1 }) })
  }
  if (filters.assignedTo) {
    const rep = teamMembers.find((m) => m.id === filters.assignedTo)?.name
    const label = rep ?? (filters.assignedTo === 'unassigned' ? 'Unassigned' : 'Rep')
    activeChips.push({ label, onRemove: () => onChange({ assignedTo: null, page: 1 }) })
  }
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? shortDate(filters.dateFrom) : '…'
    const to   = filters.dateTo   ? shortDate(filters.dateTo)   : '…'
    activeChips.push({
      label: filters.dateFrom && filters.dateTo ? `${from} → ${to}` : filters.dateFrom ? `From ${from}` : `To ${to}`,
      onRemove: () => onChange({ dateFrom: '', dateTo: '', page: 1 }),
    })
  }

  return (
    <div className="space-y-2">

      {/* ── Top bar ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

        {/* Search */}
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

        {/* Rep batch (upfront for reps) */}
        {isRep && batches.length > 0 && (
          <div className="w-full sm:w-40">
            <SelectMenu
              value={filters.batchId ?? ''}
              onChange={(v) => onChange({ batchId: v || null, page: 1 })}
              nullable
              nullLabel="All batches"
              size="sm"
              options={batches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          {/* My Leads pill */}
          {!isRep && (
            <button
              type="button"
              onClick={() => onChange({ myLeads: !filters.myLeads, page: 1 })}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-all',
                filters.myLeads
                  ? 'border-primary/50 bg-primary/5 text-primary shadow-sm'
                  : 'border-border bg-background text-muted-foreground hover:shadow-sm',
              )}
            >
              <User className="h-3.5 w-3.5" />
              My Leads
            </button>
          )}

          {/* Filters toggle */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-all',
              expanded || hasActiveFilters
                ? 'border-primary/50 bg-primary/5 text-primary shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:shadow-sm',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-lg bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={cn(
              'h-3.5 w-3.5 transition-transform duration-150',
              expanded && 'rotate-180',
            )} />
          </button>

          {/* Clear — only when something is active */}
          {(hasActiveFilters || filters.search) && (
            <button
              type="button"
              onClick={() => { setLocalSearch(''); onClear() }}
              className="flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-sm text-muted-foreground transition-all hover:shadow-sm"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Active filter chips (when panel is collapsed) ── */}
      {!expanded && activeChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-primary"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                className="flex h-3.5 w-3.5 items-center justify-center rounded-lg hover:bg-primary/20 transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Expanded filter panel ── */}
      {expanded && (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">

          {/* Status row */}
          <div className="px-5 pt-4 pb-3">
            <p className="mb-2.5 text-xs font-semibold text-muted-foreground">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_STATUSES.map((status) => {
                const meta   = STATUS_CONFIG[status]
                const active = filters.statuses.includes(status)
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-all duration-150',
                      active
                        ? cn(meta.pill, 'border-current shadow-sm ring-1 ring-current/30')
                        : 'border-border bg-muted/50 text-muted-foreground hover:shadow-sm',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', active ? meta.dot : 'bg-current opacity-40')} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Interest pills */}
          <div className="px-5 pb-3">
            <p className="mb-2.5 text-xs font-semibold text-muted-foreground">Interest</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_INTEREST_STATUSES.map((interest) => {
                const meta   = INTEREST_CONFIG[interest]
                const active = filters.interests.includes(interest)
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-all duration-150',
                      active
                        ? cn(meta.badge, 'shadow-sm scale-[1.02]')
                        : 'border-border bg-muted/50 text-muted-foreground hover:shadow-sm',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', active ? meta.dot : 'bg-current opacity-40')} />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-border" />

          {/* Second row: batch / assigned / date range */}
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">

            {!isRep && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Batch</p>
                <SelectMenu
                  value={filters.batchId ?? ''}
                  onChange={(v) => onChange({ batchId: v || null, page: 1 })}
                  nullable
                  nullLabel="All batches"
                  size="sm"
                  options={batches.map((b) => ({ value: b.id, label: b.name }))}
                />
              </div>
            )}

            {isAdmin && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Assigned To</p>
                <SelectMenu
                  value={filters.assignedTo ?? ''}
                  onChange={(v) => onChange({ assignedTo: v || null, page: 1 })}
                  nullable
                  nullLabel="All reps"
                  size="sm"
                  searchable={teamMembers.length > 5}
                  options={[
                    { value: 'unassigned', label: 'Unassigned' },
                    ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
                  ]}
                />
              </div>
            )}

            {/* Date range — side by side with arrow separator */}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Date range
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <CalendarPicker
                    value={filters.dateFrom}
                    onChange={(v) => onChange({ dateFrom: v, page: 1 })}
                    className="h-9"
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground shrink-0">→</span>
                <div className="flex-1">
                  <CalendarPicker
                    value={filters.dateTo}
                    onChange={(v) => onChange({ dateTo: v, page: 1 })}
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function shortDate(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
