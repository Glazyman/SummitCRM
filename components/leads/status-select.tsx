'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { SelectMenu } from '@/components/ui/select-menu'
import {
  STATUS_CONFIG, ALL_STATUSES, INTEREST_CONFIG, ALL_INTEREST_STATUSES,
} from './status-config'
import type { LeadStatus, InterestStatus } from '@/types/database'

// Colored dot + label, matching the reui status-select look.
function dotLabel(dotClass: string, text: string) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} />
      <span className="truncate">{text}</span>
    </span>
  )
}

export function StatusSelect({
  value, onChange, size = 'sm', className, disabled,
}: {
  value: LeadStatus
  onChange: (s: LeadStatus) => void
  size?: 'sm' | 'default'
  className?: string
  disabled?: boolean
}) {
  // Always include the current value so the trigger shows it even if it's not
  // one of the quick-pick statuses (e.g. interested/replied/converted).
  const statuses = ALL_STATUSES.includes(value) ? ALL_STATUSES : [value, ...ALL_STATUSES]
  const options = statuses.map((s) => ({ value: s, label: dotLabel(STATUS_CONFIG[s].dot, STATUS_CONFIG[s].label) }))
  return (
    <SelectMenu
      value={value}
      onChange={(v) => onChange(v as LeadStatus)}
      options={options}
      size={size}
      className={className}
      disabled={disabled}
    />
  )
}

export function InterestSelect({
  value, onChange, size = 'sm', className, disabled,
}: {
  value: InterestStatus
  onChange: (s: InterestStatus) => void
  size?: 'sm' | 'default'
  className?: string
  disabled?: boolean
}) {
  const options = ALL_INTEREST_STATUSES.map((s) => ({ value: s, label: dotLabel(INTEREST_CONFIG[s].dot, INTEREST_CONFIG[s].label) }))
  return (
    <SelectMenu
      value={value}
      onChange={(v) => onChange(v as InterestStatus)}
      options={options}
      placeholder="Interest"
      size={size}
      className={className}
      disabled={disabled}
    />
  )
}
