'use client'

import { cn } from '@/lib/utils'
import { STATUS_CONFIG, ALL_STATUSES } from './status-config'
import type { LeadStatus, StatusCount } from './types'

interface LeadStatusBarProps {
  counts:            StatusCount[]
  totalCount:        number
  activeStatuses:    LeadStatus[]
  onStatusClick:     (status: LeadStatus) => void
  coldOnly:          boolean
  onColdOnlyToggle:  () => void
}

/**
 * Horizontal scrollable bar showing lead counts grouped by status.
 * Clicking a chip toggles that status in the active filter.
 */
export function LeadStatusBar({
  counts,
  totalCount,
  activeStatuses,
  onStatusClick,
  coldOnly,
  onColdOnlyToggle,
}: LeadStatusBarProps) {
  const countMap = new Map(counts.map((c) => [c.status, c.count]))

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
      {/* All */}
      <button
        type="button"
        onClick={() => {
          activeStatuses.forEach((s) => onStatusClick(s))
        }}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium',
          'border transition-all duration-150',
          activeStatuses.length === 0
            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
            : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <span>All</span>
        <span className={cn(
          'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
          activeStatuses.length === 0 ? 'bg-primary-foreground/20' : 'bg-border'
        )}>
          {totalCount.toLocaleString()}
        </span>
      </button>

      {/* Status chips */}
      {ALL_STATUSES.map((status) => {
        const count  = countMap.get(status) ?? 0
        const meta   = STATUS_CONFIG[status]
        const active = activeStatuses.includes(status)

        if (count === 0) return null

        return (
          <button
            key={status}
            type="button"
            onClick={() => onStatusClick(status)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium',
              'border transition-all duration-150',
              active
                ? cn(meta.pill, 'border-current shadow-sm ring-1 ring-current/30')
                : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', active ? meta.dot : 'bg-current opacity-40')} />
            <span>{meta.label}</span>
            <span className={cn(
              'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
              active ? 'bg-current/20' : 'bg-border'
            )}>
              {count.toLocaleString()}
            </span>
          </button>
        )
      })}

      {/* Separator */}
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />

      {/* Cold Leads toggle */}
      <button
        type="button"
        onClick={onColdOnlyToggle}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium',
          'border transition-all duration-150',
          coldOnly
            ? 'border-cyan-300 bg-cyan-100 text-cyan-800 shadow-sm ring-1 ring-cyan-300/50'
            : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', coldOnly ? 'bg-cyan-500' : 'bg-current opacity-40')} />
        Cold Leads
      </button>
    </div>
  )
}
