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
    ? 'bg-red-500'
    : percent_used >= 80
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  const textColor = at_limit
    ? 'text-red-600 dark:text-red-400'
    : percent_used >= 80
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400'

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
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
      at_limit
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        : percent_used >= 80
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    )}>
      {at_limit ? 'Full' : `${remaining} left`}
    </span>
  )
}
