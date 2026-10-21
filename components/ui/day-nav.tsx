'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CalendarPicker } from './calendar-picker'

const p2 = (n: number) => String(n).padStart(2, '0')

/** Today as "YYYY-MM-DD" in the viewer's local timezone. */
export function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** "YYYY-MM-DD" shifted by `days`, local calendar. */
export function shiftYmd(ymd: string, days: number): string {
  const d = new Date(ymd + 'T12:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/**
 * Local midnight → next local midnight for a calendar day, as ISO strings.
 * `new Date('YYYY-MM-DD')` would be UTC midnight (the day BEFORE in US time),
 * so the day is built from local parts.
 */
export function dayRange(ymd: string): { start: string; end: string } {
  const [y, m, d] = ymd.split('-').map(Number)
  return {
    start: new Date(y, m - 1, d).toISOString(),
    end:   new Date(y, m - 1, d + 1).toISOString(),
  }
}

/** "Today" / "Yesterday" / "Mon, Oct 19". */
export function dayLabel(ymd: string): string {
  const today = todayYmd()
  if (ymd === today) return 'Today'
  if (ymd === shiftYmd(today, -1)) return 'Yesterday'
  return new Date(ymd + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** ← [date] → — step a day at a time or jump via the calendar. No future days. */
export function DayNav({
  value, onChange, className,
}: {
  value:    string
  onChange: (ymd: string) => void
  className?: string
}) {
  const atToday = value >= todayYmd()
  const btn = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:pointer-events-none'
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button type="button" className={btn} onClick={() => onChange(shiftYmd(value, -1))} aria-label="Previous day">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="w-40">
        <CalendarPicker value={value} onChange={(v) => v && onChange(v > todayYmd() ? todayYmd() : v)} className="h-9" />
      </div>
      <button type="button" className={btn} onClick={() => onChange(shiftYmd(value, 1))} disabled={atToday} aria-label="Next day">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
