'use client'

/**
 * components/admin/date-range-picker.tsx
 *
 * Preset-based date range selector that syncs state via URL params.
 * Presets: Today, 7 Days, 30 Days, This Month, Custom
 */

import React, { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button }   from '@/components/ui/button'
import { Calendar, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DateRangePreset } from './types'

interface Preset {
  value: DateRangePreset
  label: string
}

const PRESETS: Preset[] = [
  { value: 'today', label: 'Today'      },
  { value: '7d',    label: 'Last 7 days' },
  { value: '30d',   label: 'Last 30 days'},
  { value: 'month', label: 'This month'  },
]

interface DateRangePickerProps {
  value:    DateRangePreset
  onChange: (preset: DateRangePreset) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border bg-background p-1', className)}>
      <Calendar className="ml-2 h-4 w-4 text-muted-foreground shrink-0" />
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap',
            value === p.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

/** URL-synced variant — reads/writes `range` search param */
export function DateRangePickerUrl({ className }: { className?: string }) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const current      = (searchParams.get('range') as DateRangePreset) ?? '30d'

  const handleChange = (preset: DateRangePreset) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', preset)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return <DateRangePicker value={current} onChange={handleChange} className={className} />
}
