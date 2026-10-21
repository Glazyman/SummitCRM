'use client'

/**
 * components/admin/date-range-picker.tsx
 *
 * Preset-based date range selector that syncs state via URL params.
 * Presets: Today, 7 Days, 30 Days, All Time — plus "Pick day" (a single
 * calendar day) when the caller passes `day` + `onDayChange`.
 */

import React, { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button }   from '@/components/ui/button'
import { Calendar, CalendarSearch } from 'lucide-react'
import { DayNav, todayYmd } from '@/components/ui/day-nav'
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
  /** Enables the "Pick day" option: the chosen "YYYY-MM-DD" (local day). */
  day?:         string
  onDayChange?: (ymd: string) => void
}

export function DateRangePicker({ value, onChange, className, day, onDayChange }: DateRangePickerProps) {
  const dayMode = !!onDayChange && value === 'day'
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
    <div className="flex flex-1 items-center gap-1 rounded-lg border bg-background p-1 sm:flex-none">
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
      {onDayChange && (
        <button
          onClick={() => { onChange('day'); if (!day) onDayChange(todayYmd()) }}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-all whitespace-nowrap sm:flex-none sm:px-3',
            dayMode
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          <CalendarSearch className="hidden h-3.5 w-3.5 sm:block" />
          <span className="sm:hidden">Day</span>
          <span className="hidden sm:inline">Pick day</span>
        </button>
      )}
    </div>
    {dayMode && <DayNav value={day || todayYmd()} onChange={onDayChange!} />}
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
