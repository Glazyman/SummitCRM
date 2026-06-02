'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select-radix'
import {
  STATUS_CONFIG, ALL_STATUSES, INTEREST_CONFIG, ALL_INTEREST_STATUSES,
} from './status-config'
import type { LeadStatus, InterestStatus } from '@/types/database'

// Colored dot inside the item text so it also shows in the trigger value.
function dotLabel(dotClass: string, text: string) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} />
      {text}
    </span>
  )
}

type Size = 'sm' | 'md' | 'lg'

export function StatusSelect({
  value, onChange, size = 'md', className, disabled,
}: {
  value: LeadStatus
  onChange: (s: LeadStatus) => void
  size?: Size
  className?: string
  disabled?: boolean
}) {
  // Always include the current value so the trigger shows it even if it's not
  // one of the quick-pick statuses (e.g. interested/replied/converted).
  const statuses = ALL_STATUSES.includes(value) ? ALL_STATUSES : [value, ...ALL_STATUSES]
  return (
    <Select value={value} onValueChange={(v) => onChange(v as LeadStatus)} indicatorPosition="right" disabled={disabled}>
      <SelectTrigger size={size} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((s) => (
          <SelectItem key={s} value={s}>
            {dotLabel(STATUS_CONFIG[s].dot, STATUS_CONFIG[s].label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function InterestSelect({
  value, onChange, size = 'md', className, disabled,
}: {
  value: InterestStatus
  onChange: (s: InterestStatus) => void
  size?: Size
  className?: string
  disabled?: boolean
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as InterestStatus)} indicatorPosition="right" disabled={disabled}>
      <SelectTrigger size={size} className={cn('w-full', className)}>
        <SelectValue placeholder="Interest" />
      </SelectTrigger>
      <SelectContent>
        {ALL_INTEREST_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {dotLabel(INTEREST_CONFIG[s].dot, INTEREST_CONFIG[s].label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
