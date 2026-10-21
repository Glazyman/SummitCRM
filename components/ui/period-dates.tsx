'use client'

import { CalendarPicker } from './calendar-picker'
import { DayNav } from './day-nav'
import { localDate } from '@/lib/date-ranges'
import type { DateRangePreset } from '@/components/admin/types'

/** Always shows the dates represented by the active preset. */
export function PeriodDates({ preset, start, end, day, historyStart, onDayChange, onRangeChange }: {
  preset: DateRangePreset; start: string; end: string; day: string; historyStart?: string
  onDayChange: (day: string) => void
  onRangeChange: (from: string, through: string) => void
}) {
  if (preset === 'day' || preset === 'today') return <DayNav value={preset === 'today' ? localDate(new Date()) : day} onChange={onDayChange} />
  const first = preset === 'all' ? historyStart ? localDate(new Date(historyStart)) : '' : localDate(new Date(start))
  const last = localDate(new Date(Date.parse(end) - 1))
  return <div className="flex flex-wrap items-center gap-2" aria-label="Selected date range">
    <label className="flex items-center gap-2 text-xs text-muted-foreground">From
      <div className="w-36"><CalendarPicker showYear value={first} placeholder={preset === 'all' ? 'First activity' : 'Start date'} onChange={value => value && onRangeChange(value, value > last ? value : last)} className="h-9" /></div>
    </label>
    <label className="flex items-center gap-2 text-xs text-muted-foreground">To
      <div className="w-36"><CalendarPicker showYear value={last} onChange={value => value && onRangeChange(!first || value < first ? value : first, value)} className="h-9" /></div>
    </label>
  </div>
}
