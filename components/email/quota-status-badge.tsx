'use client'

import { cn } from '@/lib/utils'
import type { QuotaStatus } from '@/lib/email/types'

interface QuotaStatusBadgeProps {
  quota:    QuotaStatus
  size?:    'sm' | 'md'
  showBar?: boolean
}

export function QuotaStatusBadge({
  quota,
  size = 'md',
  showBar = true,
}: QuotaStatusBadgeProps) {
  const { sent_today, daily_limit, remaining, percent_used, at_limit } = quota

  const barColor = at_limit
    ? 'bg-foreground'
    : percent_used >= 80
      ? 'bg-foreground/70'
      : 'bg-foreground/50'

  const textColor = at_limit
    ? 'text-foreground'
    : percent_used >= 80
      ? 'text-foreground'
      : 'text-muted-foreground'

  return (
    <div className={cn('space-y-1', size === 'sm' ? 'text-xs' : 'text-sm')}>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">
          {sent_today}/{daily_limit} sent today
        </span>
        <span className={cn('font-medium tabular-nums', textColor)}>
          {at_limit ? 'Quota full' : `${remaining} left`}
        </span>
      </div>
      {showBar && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${Math.min(100, percent_used)}%` }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Compact inline badge for use in dropdowns / compose form account picker.
 */
export function QuotaChip({ quota }: { quota: QuotaStatus }) {
  const { remaining, at_limit, percent_used } = quota

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums',
      at_limit
        ? 'border-border bg-primary text-primary-foreground'
        : percent_used >= 80
          ? 'border-border bg-secondary text-foreground'
          : 'border-border bg-card text-muted-foreground'
    )}>
      {at_limit ? 'Full' : `${remaining} left`}
    </span>
  )
}
