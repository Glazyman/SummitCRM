'use client'

/**
 * components/admin/date-range-picker.tsx
 *
 * Preset-based date range selector that syncs state via URL params.
 * Presets: Today, 7 Days, 30 Days, All Time, Custom
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
  /** Shorter label used on phones so all four fit in one row. */
  short: string
}

const PRESETS: Preset[] = [
  { value: 'today', label: 'Today',        short: 'Today'    },
  { value: '7d',    label: 'Last 7 days',  short: '7 days'   },
  { value: '30d',   label: 'Last 30 days', short: '30 days'  },
  { value: 'all',   label: 'All time',     short: 'All time' },
]

interface DateRangePickerProps {
  value:    DateRangePreset
  onChange: (preset: DateRangePreset) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border bg-background p-1', className)}>
      {/* Calendar icon is decorative — hide it on phones to give the buttons room. */}
      <Calendar className="ml-2 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            // Phones: equal-width segments that fill the row. Desktop: auto width.
            'flex-1 rounded-md px-2 py-1.5 text-center text-sm font-medium transition-all whitespace-nowrap sm:flex-none sm:px-3',
            value === p.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          <span className="sm:hidden">{p.short}</span>
          <span className="hidden sm:inline">{p.label}</span>
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
