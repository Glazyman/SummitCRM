'use client'

/**
 * Shared calendar / time picker components.
 * Used by follow-up-section, activity forms, lead filters, etc.
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────────────────────
export function p2(n: number) { return String(n).padStart(2, '0') }

/** Convert "HH:MM" (24h) → "H:MM AM/PM" */
export function fmt12(t: string): string {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  const h    = parseInt(hStr, 10)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${mStr} ${ampm}`
}

/** Split "YYYY-MM-DDTHH:MM" into date + time parts. */
export function splitDateTime(dt: string): { date: string; time: string } {
  const [date, time] = dt.split('T')
  return { date: date ?? '', time: time?.slice(0, 5) ?? '09:00' }
}

export function joinDateTime(date: string, time: string): string {
  return `${date}T${time}`
}

export function toLocalDatetimeInput(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// ── Date/time popover positioning hook ────────────────────────────────────
function usePopoverPos(
  open: boolean,
  btnRef: React.RefObject<HTMLElement | null>,
  menuRef: React.RefObject<HTMLElement | null>,
) {
  React.useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return
    const a   = btnRef.current.getBoundingClientRect()
    const m   = menuRef.current as HTMLElement
    const mw  = m.offsetWidth  || 280
    const mh  = m.offsetHeight || 320
    const pad = 8

    let top  = a.bottom + 4
    if (top + mh > window.innerHeight - pad) top = a.top - mh - 4
    if (top < pad) top = a.bottom + 4

    let left = a.left
    if (left + mw > window.innerWidth - pad) left = a.right - mw
    left = Math.max(pad, left)

    m.style.top  = `${Math.round(top)}px`
    m.style.left = `${Math.round(left)}px`
  }, [open, btnRef, menuRef])
}

function useOutsideClose(
  open: boolean,
  onClose: () => void,
  btnRef: React.RefObject<HTMLElement | null>,
  menuRef: React.RefObject<HTMLElement | null>,
) {
  React.useEffect(() => {
    if (!open) return
    function onMouse(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return
      if (menuRef.current?.contains(e.target as Node)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown',   onKey)
    }
  }, [open, onClose, btnRef, menuRef])
}

// ── Calendar picker ────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function CalendarPicker({
  value,
  onChange,
  className,
}: {
  value:     string      // "YYYY-MM-DD"
  onChange:  (v: string) => void
  className?: string
}) {
  const [open,    setOpen]    = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const btnRef  = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const today = React.useMemo(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
  }, [])

  const [viewYear,  setViewYear]  = React.useState(() =>
    value ? new Date(value + 'T12:00').getFullYear()  : today.year
  )
  const [viewMonth, setViewMonth] = React.useState(() =>
    value ? new Date(value + 'T12:00').getMonth()     : today.month
  )

  React.useEffect(() => { setMounted(true) }, [])

  // Sync view to selected value whenever we open
  React.useEffect(() => {
    if (open && value) {
      const d = new Date(value + 'T12:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [open, value])

  const close = React.useCallback(() => setOpen(false), [])
  usePopoverPos(open, btnRef, menuRef)
  useOutsideClose(open, close, btnRef, menuRef)

  // Build 42-cell grid
  const firstWeekday  = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth   = new Date(viewYear, viewMonth + 1, 0).getDate()
  const daysInPrevMon = new Date(viewYear, viewMonth, 0).getDate()

  interface Cell { day: number; dateStr: string; currentMonth: boolean }
  const cells: Cell[] = []

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d  = daysInPrevMon - i
    const pm = viewMonth === 0 ? 12 : viewMonth
    const py = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ day: d, dateStr: `${py}-${p2(pm)}-${p2(d)}`, currentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: `${viewYear}-${p2(viewMonth + 1)}-${p2(d)}`, currentMonth: true })
  }
  const nm = viewMonth === 11 ? 1 : viewMonth + 2
  const ny = viewMonth === 11 ? viewYear + 1 : viewYear
  for (let d = 1; cells.length < 42; d++) {
    cells.push({ day: d, dateStr: `${ny}-${p2(nm)}-${p2(d)}`, currentMonth: false })
  }

  const todayStr = `${today.year}-${p2(today.month + 1)}-${p2(today.day)}`

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11) }
    else setViewMonth((m) => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0) }
    else setViewMonth((m) => m + 1)
  }

  const displayValue = value
    ? new Date(value + 'T12:00').toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
      })
    : undefined

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm transition-colors',
          'hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring',
          open && 'ring-2 ring-ring border-ring',
          !value ? 'text-muted-foreground' : 'text-foreground',
          className,
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{displayValue ?? 'Pick a date'}</span>
      </button>

      {open && mounted && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, width: 276 }}
          className="rounded-2xl border border-border bg-popover shadow-card p-3"
        >
          {/* Month navigation */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="mb-1 grid grid-cols-7">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              const isSelected = cell.dateStr === value
              const isToday    = cell.dateStr === todayStr
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(cell.dateStr); setOpen(false) }}
                  className={cn(
                    'flex h-8 w-full items-center justify-center rounded-lg text-xs font-medium transition-colors',
                    isSelected && 'bg-primary text-primary-foreground shadow-sm',
                    !isSelected && isToday && 'ring-1 ring-inset ring-primary text-primary font-semibold',
                    !isSelected && !isToday &&  cell.currentMonth && 'text-foreground hover:bg-muted',
                    !isSelected && !isToday && !cell.currentMonth && 'text-muted-foreground/40 hover:bg-muted/50',
                  )}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {/* Today shortcut */}
          <div className="mt-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => { onChange(todayStr); setOpen(false) }}
              className="w-full rounded-lg py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Today
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Time picker ────────────────────────────────────────────────────────────
const TIME_SLOTS: string[] = (() => {
  const out: string[] = []
  for (let h = 6; h <= 21; h++) {
    out.push(`${p2(h)}:00`)
    if (h < 21) out.push(`${p2(h)}:30`)
  }
  out.push('21:30')
  return out
})()

export function TimePicker({
  value,
  onChange,
  className,
}: {
  value:     string  // "HH:MM"
  onChange:  (v: string) => void
  className?: string
}) {
  const [open,    setOpen]    = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const btnRef      = React.useRef<HTMLButtonElement>(null)
  const menuRef     = React.useRef<HTMLDivElement>(null)
  const selectedRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => { setMounted(true) }, [])

  React.useEffect(() => {
    if (open && selectedRef.current) {
      const t = setTimeout(() => selectedRef.current?.scrollIntoView({ block: 'center' }), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  const close = React.useCallback(() => setOpen(false), [])
  usePopoverPos(open, btnRef, menuRef)
  useOutsideClose(open, close, btnRef, menuRef)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-32 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm transition-colors',
          'hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring',
          open && 'ring-2 ring-ring border-ring',
          !value ? 'text-muted-foreground' : 'text-foreground',
          className,
        )}
      >
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{value ? fmt12(value) : 'Time'}</span>
      </button>

      {open && mounted && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, width: 152 }}
          className="rounded-2xl border border-border bg-popover shadow-card overflow-hidden"
        >
          <div className="max-h-60 overflow-y-auto py-1.5 overscroll-contain">
            {TIME_SLOTS.map((slot) => {
              const sel = slot === value
              return (
                <button
                  key={slot}
                  ref={sel ? selectedRef : undefined}
                  type="button"
                  onClick={() => { onChange(slot); setOpen(false) }}
                  className={cn(
                    'flex w-full items-center px-4 py-1.5 text-sm transition-colors',
                    sel
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  {fmt12(slot)}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Combined date + time picker ────────────────────────────────────────────
export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  date:         string
  time:         string
  onDateChange: (v: string) => void
  onTimeChange: (v: string) => void
}) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <CalendarPicker value={date} onChange={onDateChange} />
      </div>
      <TimePicker value={time} onChange={onTimeChange} />
    </div>
  )
}
