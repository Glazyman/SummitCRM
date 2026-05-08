'use client'

import * as React from 'react'
import { Search, X, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { STATUS_CONFIG, ALL_STATUSES } from './status-config'
import type { LeadFilters, LeadStatus } from './types'

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

/**
 * Collapsible filter panel: search, status chips, batch, assignee, date range, My Leads toggle.
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

  // Track if any non-search filter is active
  const hasActiveFilters =
    filters.statuses.length > 0 ||
    filters.batchId ||
    filters.assignedTo ||
    filters.myLeads ||
    filters.dateFrom ||
    filters.dateTo

  function toggleStatus(status: LeadStatus) {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status]
    onChange({ statuses: next, page: 1 })
  }

  return (
    <div className="space-y-3">
      {/* Top row: search + batch (for reps) + filter toggle */}
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
              'h-9 w-full rounded-lg border border-input bg-background pl-9 pr-4 text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
              'transition-all duration-150'
            )}
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => { setLocalSearch(''); onChange({ search: '', page: 1 }); searchRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Batch — upfront for reps (their primary organizer by industry) */}
        {isRep && batches.length > 0 && (
          <select
            value={filters.batchId ?? ''}
            onChange={(e) => onChange({ batchId: e.target.value || null, page: 1 })}
            className={cn(
              'h-9 rounded-lg border border-input bg-background px-3 text-sm sm:w-44',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
              filters.batchId && 'border-primary/50 bg-primary/5 text-primary'
            )}
          >
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-2">
          {/* My Leads toggle — hidden for reps (they only see their own leads) */}
          {!isRep && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm transition-colors hover:bg-muted">
              <ToggleSwitch
                checked={filters.myLeads}
                onChange={(v) => onChange({ myLeads: v, page: 1 })}
              />
              <span className="font-medium">My Leads</span>
            </label>
          )}

          {/* Expand filters */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'gap-1.5',
              hasActiveFilters && 'border-primary/50 bg-primary/5 text-primary hover:bg-primary/10'
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {[
                  filters.statuses.length > 0,
                  !!filters.batchId,
                  !!filters.assignedTo,
                  !!filters.dateFrom || !!filters.dateTo,
                ].filter(Boolean).length}
              </span>
            )}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          </Button>

          {(hasActiveFilters || filters.search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setLocalSearch(''); onClear() }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {/* Status multi-select */}
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
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
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        'transition-all duration-100',
                        active
                          ? cn(meta.badge, 'shadow-sm')
                          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', active ? meta.dot : 'bg-current/40')} />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Batch — only in expanded panel for admins; reps have it upfront */}
            {!isRep && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Batch</label>
                <select
                  value={filters.batchId ?? ''}
                  onChange={(e) => onChange({ batchId: e.target.value || null, page: 1 })}
                  className={cn(
                    'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0'
                  )}
                >
                  <option value="">All batches</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Assigned to (admin/manager only) */}
            {isAdmin && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned To</label>
                <select
                  value={filters.assignedTo ?? ''}
                  onChange={(e) => onChange({ assignedTo: e.target.value || null, page: 1 })}
                  className={cn(
                    'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0'
                  )}
                >
                  <option value="">All reps</option>
                  <option value="unassigned">Unassigned</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date range */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onChange({ dateFrom: e.target.value, page: 1 })}
                className={cn(
                  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0'
                )}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onChange({ dateTo: e.target.value, page: 1 })}
                className={cn(
                  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0'
                )}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border-2 border-transparent',
        'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-primary' : 'bg-input'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm',
          'transition-transform duration-200',
          checked ? 'translate-x-3' : 'translate-x-0'
        )}
      />
    </button>
  )
}
