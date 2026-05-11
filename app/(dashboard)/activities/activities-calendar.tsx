'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Phone, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
type ViewMode = 'month' | 'week' | 'day'
type Priority = 'high' | 'medium' | 'low'
type ActivityType = 'follow_up' | 'callback'

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  company: string | null
}

export interface CalendarActivity {
  id: string
  type: ActivityType
  priority: Priority
  title: string
  notes: string | null
  due_at: string
  completed_at: string | null
  assigned_to: string | null
  created_at: string
  lead: Lead | null
}

interface Props {
  activities: CalendarActivity[]
  onActivityClick: (a: CalendarActivity) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function todayKey(): string { return toLocalDateKey(new Date()) }

// Start of week for a given date (Monday = 0)
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day // adjust to Mon
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// Activity pill color by type
function pillClasses(a: CalendarActivity, compact = false) {
  const done = !!a.completed_at
  const base = compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
  if (done) return cn(base, 'bg-muted text-muted-foreground line-through')
  if (a.type === 'callback') return cn(base, 'bg-blue-100 text-blue-800')
  // follow_up — shade by priority
  if (a.priority === 'high')   return cn(base, 'bg-red-100 text-red-800')
  if (a.priority === 'low')    return cn(base, 'bg-emerald-100 text-emerald-800')
  return cn(base, 'bg-violet-100 text-violet-800')
}

function leadName(lead: Lead | null) {
  if (!lead) return ''
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
}

// ── Main component ────────────────────────────────────────────────────────────
export function ActivitiesCalendar({ activities, onActivityClick }: Props) {
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d
  })

  // Group activities by local date key
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarActivity[]>()
    for (const a of activities) {
      const key = toLocalDateKey(new Date(a.due_at))
      const arr = map.get(key) ?? []
      arr.push(a)
      map.set(key, arr)
    }
    return map
  }, [activities])

  // ── Navigation ──
  function prev() {
    if (view === 'month') setCursor(d => { const n = new Date(d); n.setMonth(n.getMonth()-1); return n })
    else if (view === 'week') setCursor(d => addDays(d, -7))
    else setCursor(d => addDays(d, -1))
  }
  function next() {
    if (view === 'month') setCursor(d => { const n = new Date(d); n.setMonth(n.getMonth()+1); return n })
    else if (view === 'week') setCursor(d => addDays(d, 7))
    else setCursor(d => addDays(d, 1))
  }
  function goToday() { const d = new Date(); d.setHours(0,0,0,0); setCursor(d) }

  // ── Title ──
  const title = view === 'month'
    ? `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`
    : view === 'week'
    ? (() => {
        const s = startOfWeek(cursor)
        const e = addDays(s, 6)
        if (s.getMonth() === e.getMonth())
          return `${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}`
        return `${MONTH_NAMES[s.getMonth()]} – ${MONTH_NAMES[e.getMonth()]} ${e.getFullYear()}`
      })()
    : `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`

  return (
    <div className="flex flex-col rounded-[24px] border border-border bg-card shadow-card overflow-hidden">

      {/* ── Calendar header ── */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <button
          onClick={goToday}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:shadow-sm transition-all"
        >
          Today
        </button>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={next} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-[15px] font-bold tracking-[-0.02em]">{title}</span>

        {/* View switcher */}
        <div className="ml-auto flex items-center rounded-full border border-border bg-background p-0.5 text-[13px] font-medium">
          {(['month','week','day'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-full px-3 py-1 capitalize transition-all',
                view === v ? 'bg-foreground text-background font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── View body ── */}
      {view === 'month' && <MonthView cursor={cursor} byDate={byDate} onDayClick={setCursor} onActivityClick={onActivityClick} />}
      {view === 'week'  && <WeekView  cursor={cursor} byDate={byDate} onDayClick={setCursor} onActivityClick={onActivityClick} />}
      {view === 'day'   && <DayView   cursor={cursor} byDate={byDate} onActivityClick={onActivityClick} />}
    </div>
  )
}

// ── Month view ────────────────────────────────────────────────────────────────
function MonthView({
  cursor, byDate, onDayClick, onActivityClick,
}: {
  cursor: Date
  byDate: Map<string, CalendarActivity[]>
  onDayClick: (d: Date) => void
  onActivityClick: (a: CalendarActivity) => void
}) {
  const today = todayKey()

  // Build 6-week grid starting from Monday
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart    = startOfWeek(firstOfMonth)
  const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const weeks: Date[][] = Array.from({ length: 6 }, (_, w) => days.slice(w*7, w*7+7))

  // Drop trailing empty weeks
  const trimmedWeeks = weeks.filter((week) =>
    week.some((d) => d.getMonth() === cursor.getMonth())
  )

  return (
    <div className="flex-1 overflow-auto">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_NAMES_SHORT.map((d) => (
          <div key={d} className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid" style={{ gridTemplateRows: `repeat(${trimmedWeeks.length}, minmax(100px, 1fr))` }}>
        {trimmedWeeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              const key       = toLocalDateKey(day)
              const isToday   = key === today
              const isOther   = day.getMonth() !== cursor.getMonth()
              const dayActs   = byDate.get(key) ?? []
              const visible   = dayActs.slice(0, 2)
              const overflow  = dayActs.length - visible.length
              const isLast    = wi === trimmedWeeks.length - 1

              return (
                <div
                  key={di}
                  onClick={() => onDayClick(day)}
                  className={cn(
                    'relative flex flex-col gap-1 p-2 border-b border-r border-border cursor-pointer',
                    'transition-colors hover:bg-secondary/40 min-h-[100px]',
                    isOther && 'bg-muted/20',
                    di === 6 && 'border-r-0',
                    isLast  && 'border-b-0',
                  )}
                >
                  {/* Date number */}
                  <div className="flex items-center">
                    <span className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold leading-none',
                      isToday  ? 'bg-foreground text-background' : '',
                      isOther  ? 'text-muted-foreground/50' : 'text-foreground',
                    )}>
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="flex flex-col gap-0.5">
                    {visible.map((a) => (
                      <button
                        key={a.id}
                        onClick={(e) => { e.stopPropagation(); onActivityClick(a) }}
                        className={cn(
                          'flex w-full items-center gap-1 rounded-md truncate text-left leading-snug',
                          pillClasses(a, true),
                        )}
                        title={a.title}
                      >
                        <span className="truncate flex-1">{fmtTime(a.due_at)} · {leadName(a.lead) || a.title}</span>
                      </button>
                    ))}
                    {overflow > 0 && (
                      <span className="text-[10px] font-semibold text-muted-foreground pl-0.5">+{overflow} more</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Week view ─────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 7am – 8pm

function WeekView({
  cursor, byDate, onDayClick, onActivityClick,
}: {
  cursor: Date
  byDate: Map<string, CalendarActivity[]>
  onDayClick: (d: Date) => void
  onActivityClick: (a: CalendarActivity) => void
}) {
  const today  = todayKey()
  const start  = startOfWeek(cursor)
  const week   = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      {/* Day headers */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: '52px repeat(7, 1fr)' }}>
        <div className="border-r border-border" />
        {week.map((day, i) => {
          const key     = toLocalDateKey(day)
          const isToday = key === today
          return (
            <div
              key={i}
              onClick={() => onDayClick(day)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 cursor-pointer hover:bg-secondary/40 transition-colors',
                i < 6 && 'border-r border-border',
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                {DAY_NAMES_SHORT[i]}
              </span>
              <span className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-bold',
                isToday ? 'bg-foreground text-background' : 'text-foreground',
              )}>
                {day.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex flex-1 overflow-auto">
        <div className="flex flex-col shrink-0 w-[52px] border-r border-border">
          {HOURS.map((h) => (
            <div key={h} className="relative h-14 border-b border-border">
              <span className="absolute -top-2 right-2 text-[10px] font-medium text-muted-foreground">
                {h === 12 ? '12pm' : h > 12 ? `${h-12}pm` : `${h}am`}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-1">
          {week.map((day, di) => {
            const key  = toLocalDateKey(day)
            const acts = byDate.get(key) ?? []
            return (
              <div key={di} className={cn('relative flex-1 border-b border-border', di < 6 && 'border-r border-border')}>
                {HOURS.map((h) => (
                  <div key={h} className="h-14 border-b border-border last:border-b-0" />
                ))}
                {acts.map((a) => {
                  const d    = new Date(a.due_at)
                  const hour = d.getHours() + d.getMinutes() / 60
                  const top  = Math.max(0, (hour - 7)) * 56 // 56px per hour
                  return (
                    <button
                      key={a.id}
                      onClick={() => onActivityClick(a)}
                      style={{ top }}
                      className={cn(
                        'absolute left-1 right-1 rounded-lg px-1.5 py-1 text-left text-[10px] font-medium leading-tight cursor-pointer hover:shadow-sm transition-all',
                        pillClasses(a),
                      )}
                    >
                      <div className="flex items-center gap-1 truncate">
                        {a.type === 'callback' ? <Phone className="h-2.5 w-2.5 shrink-0" /> : <ArrowUpRight className="h-2.5 w-2.5 shrink-0" />}
                        <span className="truncate">{a.title}</span>
                      </div>
                      <div className="mt-0.5 truncate opacity-75">{fmtTime(a.due_at)}</div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Day view ──────────────────────────────────────────────────────────────────
function DayView({
  cursor, byDate, onActivityClick,
}: {
  cursor: Date
  byDate: Map<string, CalendarActivity[]>
  onActivityClick: (a: CalendarActivity) => void
}) {
  const key  = toLocalDateKey(cursor)
  const acts = byDate.get(key) ?? []

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      {/* Date header */}
      <div className="border-b border-border px-5 py-3">
        <span className="text-[13px] font-semibold text-muted-foreground">
          {cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {acts.length} {acts.length === 1 ? 'activity' : 'activities'}
        </span>
      </div>

      {/* Time grid */}
      <div className="flex flex-1">
        <div className="flex flex-col shrink-0 w-[52px] border-r border-border">
          {HOURS.map((h) => (
            <div key={h} className="relative h-16 border-b border-border">
              <span className="absolute -top-2 right-2 text-[10px] font-medium text-muted-foreground">
                {h === 12 ? '12pm' : h > 12 ? `${h-12}pm` : `${h}am`}
              </span>
            </div>
          ))}
        </div>

        <div className="relative flex-1">
          {HOURS.map((h) => (
            <div key={h} className="h-16 border-b border-border" />
          ))}
          {acts.map((a) => {
            const d    = new Date(a.due_at)
            const hour = d.getHours() + d.getMinutes() / 60
            const top  = Math.max(0, (hour - 7)) * 64
            return (
              <button
                key={a.id}
                onClick={() => onActivityClick(a)}
                style={{ top }}
                className={cn(
                  'absolute left-2 right-4 rounded-xl px-3 py-2 text-left cursor-pointer hover:shadow-sm transition-all',
                  pillClasses(a),
                )}
              >
                <div className="flex items-center gap-1.5 font-semibold text-[12px]">
                  {a.completed_at && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                  {a.type === 'callback' ? <Phone className="h-3 w-3 shrink-0" /> : <ArrowUpRight className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{a.title}</span>
                </div>
                <div className="mt-0.5 text-[11px] opacity-75 flex items-center gap-2">
                  <span>{fmtTime(a.due_at)}</span>
                  {leadName(a.lead) && <span>· {leadName(a.lead)}</span>}
                </div>
              </button>
            )
          })}

          {acts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No activities scheduled</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
