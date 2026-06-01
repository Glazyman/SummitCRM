'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Phone, ArrowUpRight, CheckCircle2, Circle, Clock,
  Plus, X, User, List, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { CalendarPicker, TimePicker, splitDateTime, joinDateTime, toLocalDatetimeInput } from '@/components/ui/calendar-picker'
import { useTakenSlots } from '@/hooks'
import { LeadFullPanel } from '@/components/leads/lead-full-panel'
import { TasksCalendar, toLocalDateKey, fmtTime } from './tasks-calendar'
import type { TeamMember } from '@/components/leads/detail/types'

// ── Types ─────────────────────────────────────────────────────────────────────
type Priority = 'high' | 'medium' | 'low'
type ActivityType = 'follow_up' | 'callback'

interface Lead {
  id: string
  first_name: string | null
  last_name:  string | null
  email:      string
  phone:      string | null
  company:    string | null
}

interface Activity {
  id:           string
  type:         ActivityType
  priority:     Priority
  title:        string
  notes:        string | null
  due_at:       string
  completed_at: string | null
  assigned_to:  string | null
  created_at:   string
  lead:         Lead | null
}

function leadName(lead: Lead | null) {
  if (!lead) return '—'
  const n = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  return n || lead.email
}

type DueBucket = 'past' | 'today' | 'future'

// A task stored at local 00:00 is "untimed" (no time slot). The time picker
// only offers 6am–9:30pm, so midnight is an unambiguous "no time" sentinel.
function isUntimed(d: Date): boolean {
  return d.getHours() === 0 && d.getMinutes() === 0
}

function fmtDate(iso: string): { label: string; bucket: DueBucket } {
  const d   = new Date(iso)
  const now = new Date()
  // Compare calendar days so a 11pm follow-up still reads "Today" at 8am
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueMidnight   = new Date(d.getFullYear(),   d.getMonth(),   d.getDate())
  const days = Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / 86400000)
  // Untimed tasks show only the date (no "· 2:30 PM" suffix).
  const suffix = isUntimed(d) ? '' : ` · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  if (days < 0)   return { label: `${Math.abs(days)}d overdue`, bucket: 'past' }
  if (days === 0) return { label: `Today${suffix}`, bucket: 'today' }
  if (days === 1) return { label: `Tomorrow${suffix}`, bucket: 'future' }
  return { label: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${suffix}`, bucket: 'future' }
}

// Overdue is calendar-day aware: an untimed task due today (stored at 00:00) is
// NOT overdue just because midnight has passed — only a past calendar day, or a
// timed task whose time has elapsed today, counts as overdue.
function isOverdue(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due0   = new Date(d.getFullYear(),   d.getMonth(),   d.getDate())
  if (due0.getTime() < today0.getTime()) return true
  if (due0.getTime() > today0.getTime()) return false
  return !isUntimed(d) && d.getTime() < now.getTime()
}

/** Tomorrow at 9 AM in local time. */
function defaultActivityDueAt(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return toLocalDatetimeInput(d)
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  initialActivities: Activity[]
  teamMembers:       { id: string; name: string }[]
  currentUserId:     string
  isAdmin?:          boolean
}

export function TasksClient({ initialActivities, teamMembers, currentUserId, isAdmin }: Props) {
  const [activities,      setActivities]      = useState<Activity[]>(initialActivities)
  const [justCompleted,   setJustCompleted]   = useState<Set<string>>(new Set())
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [search,          setSearch]          = useState('')
  const [filterType,      setFilterType]      = useState('')
  const [filterAssigned,  setFilterAssigned]  = useState('')
  const [filterDone,      setFilterDone]      = useState('false')
  const [showNew,         setShowNew]         = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [pageView,        setPageView]        = useState<'list' | 'calendar'>('list')
  const [calendarDay,            setCalendarDay]            = useState<Date | null>(null)
  const [calendarLeadId,         setCalendarLeadId]         = useState<string | null>(null)
  const [calendarFilterAssigned, setCalendarFilterAssigned] = useState('')
  const [calendarFilterStatus,   setCalendarFilterStatus]   = useState('open')
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivities(initialActivities)
  }, [initialActivities])

  // ── New form ──────────────────────────────────────────────────────────────
  const defaultDue = splitDateTime(defaultActivityDueAt())
  const [newForm, setNewForm] = useState(() => ({
    leadId:     '',
    type:       'follow_up' as ActivityType,
    priority:   'medium'   as Priority,
    title:      '',
    notes:      '',
    dueDate:    defaultDue.date,
    dueTime:    defaultDue.time,
    noTime:     false,   // "all day" — store at 00:00 (no time slot)
    assignedTo: currentUserId,
  }))
  // Slots already booked by this task's assignee on the chosen date, so the
  // time picker can grey them out and avoid double-booking the rep.
  const takenSlots = useTakenSlots(newForm.assignedTo || currentUserId, newForm.dueDate)

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return activities.filter((a) => {
      if (filterType     && a.type        !== filterType)     return false
      if (filterAssigned && a.assigned_to !== filterAssigned) return false
      // For filterDone: if item is justCompleted, keep it visible briefly
      if (filterDone === 'true'  && !a.completed_at && !justCompleted.has(a.id)) return false
      if (filterDone === 'false' &&  a.completed_at && !justCompleted.has(a.id)) return false
      if (q) {
        const hay = [a.title, leadName(a.lead), a.lead?.company, a.lead?.email, a.lead?.phone]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [activities, search, filterType, filterAssigned, filterDone, justCompleted])

  // ── Calendar-specific filtered activities ────────────────────────────────
  const calendarFiltered = useMemo(() => {
    return activities.filter((a) => {
      if (calendarFilterAssigned && a.assigned_to !== calendarFilterAssigned) return false
      if (calendarFilterStatus === 'open')     return !a.completed_at
      if (calendarFilterStatus === 'past_due') return !a.completed_at && isOverdue(a.due_at)
      if (calendarFilterStatus === 'completed') return !!a.completed_at
      return true // 'all'
    })
  }, [activities, calendarFilterAssigned, calendarFilterStatus])

  // ── Toggle done (with brief visual linger) ────────────────────────────────
  async function toggleDone(activity: Activity) {
    const nowDone = !activity.completed_at
    const updatedAt = nowDone ? new Date().toISOString() : null

    setActivities((prev) => prev.map((a) =>
      a.id === activity.id ? { ...a, completed_at: updatedAt } : a
    ))
    if (selectedActivity?.id === activity.id) {
      setSelectedActivity((s) => s ? { ...s, completed_at: updatedAt } : s)
    }

    if (nowDone) {
      setJustCompleted((s) => new Set([...s, activity.id]))
      const t = setTimeout(() => {
        setJustCompleted((s) => { const n = new Set(s); n.delete(activity.id); return n })
        setSelectedActivity((s) => s?.id === activity.id ? null : s)
      }, 1200)
      timers.current.set(activity.id, t)
    } else {
      const t = timers.current.get(activity.id)
      if (t) { clearTimeout(t); timers.current.delete(activity.id) }
      setJustCompleted((s) => { const n = new Set(s); n.delete(activity.id); return n })
    }

    await fetch(`/api/tasks/${activity.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ completed: nowDone }),
    })
  }

  async function deleteActivity(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id))
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
  }

  async function handleCreate() {
    if (!newForm.title.trim() || !newForm.leadId) return
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          leadId:     newForm.leadId,
          type:       newForm.type,
          priority:   newForm.priority,
          title:      newForm.title,
          notes:      newForm.notes || undefined,
          dueAt:      new Date(joinDateTime(newForm.dueDate, newForm.noTime ? '00:00' : (newForm.dueTime || '09:00'))).toISOString(),
          assignedTo: newForm.assignedTo || null,
        }),
      })
      if (res.ok) {
        const listRes = await fetch('/api/tasks?done=false')
        const json = await listRes.json() as { data?: { activities: Activity[] } }
        if (json.data?.activities) setActivities(json.data.activities)
        setShowNew(false)
        const resetDue = splitDateTime(defaultActivityDueAt())
        setNewForm({ leadId: '', type: 'follow_up', priority: 'medium', title: '', notes: '',
          dueDate: resetDue.date, dueTime: resetDue.time, noTime: false, assignedTo: currentUserId })
      }
    } finally { setSaving(false) }
  }

  const openCount    = activities.filter((a) => !a.completed_at).length
  const overdueCount = activities.filter((a) => !a.completed_at && isOverdue(a.due_at)).length

  const panelTeamMembers = (teamMembers as TeamMember[])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {openCount} open{overdueCount > 0 && <span className="text-red-500 font-medium"> · {overdueCount} overdue</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* List / Calendar toggle */}
          <div className="flex items-center rounded-full border border-border bg-background p-0.5 text-[13px] font-medium">
            <button
              onClick={() => setPageView('list')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all',
                pageView === 'list' ? 'bg-foreground text-background font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              onClick={() => setPageView('calendar')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all',
                pageView === 'calendar' ? 'bg-foreground text-background font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendar
            </button>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Task
          </Button>
        </div>
      </div>

      {/* Calendar view */}
      {pageView === 'calendar' && (
        <div className="space-y-3">
          {/* Calendar filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status filter pills */}
            <div className="flex items-center gap-1.5">
              {[
                { value: 'open',      label: 'Open'      },
                { value: 'past_due',  label: 'Past Due'  },
                { value: 'completed', label: 'Completed' },
                { value: 'all',       label: 'All'       },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setCalendarFilterStatus(value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all',
                    calendarFilterStatus === value
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border bg-background text-muted-foreground hover:shadow-sm'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Rep filter — admins only */}
            {isAdmin && teamMembers.length > 0 && (
              <SelectMenu
                value={calendarFilterAssigned}
                onChange={setCalendarFilterAssigned}
                nullable
                nullLabel="All reps"
                size="sm"
                searchable={teamMembers.length > 5}
                options={teamMembers.map((m) => ({ value: m.id, label: m.name }))}
                className="w-40"
              />
            )}

            <span className="ml-auto text-[12px] text-muted-foreground">
              {calendarFiltered.length} {calendarFiltered.length === 1 ? 'task' : 'tasks'}
            </span>
          </div>

          <TasksCalendar
            activities={calendarFiltered}
            selectedDay={calendarDay}
            onDayOpen={(d) => { setCalendarDay(d); setCalendarLeadId(null) }}
            onActivityClick={(a) => {
              if (a.lead) { setCalendarLeadId(a.lead.id); setCalendarDay(new Date(a.due_at)) }
            }}
          />
        </div>
      )}

      <>{pageView === 'list' && <>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-48 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <SelectMenu
          value={filterType}
          onChange={setFilterType}
          nullable
          nullLabel="All types"
          size="sm"
          options={[
            { value: 'follow_up', label: 'Follow-up' },
            { value: 'callback',  label: 'Call Back'  },
          ]}
          className="w-36"
        />

        {isAdmin && (
          <SelectMenu
            value={filterAssigned}
            onChange={setFilterAssigned}
            nullable
            nullLabel="All reps"
            size="sm"
            searchable={teamMembers.length > 5}
            options={teamMembers.map((m) => ({ value: m.id, label: m.name }))}
            className="w-40"
          />
        )}

        <SelectMenu
          value={filterDone}
          onChange={setFilterDone}
          size="sm"
          options={[
            { value: 'false', label: 'Open'            },
            { value: 'true',  label: 'Past / Completed' },
            { value: '',      label: 'All'              },
          ]}
          className="w-40"
        />
      </div>

      {/* Mobile card list — replaces the wide table below lg */}
      <div className="space-y-2 lg:hidden">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border py-12 text-center text-muted-foreground text-sm">
            {activities.length === 0 ? 'No tasks yet.' : 'No tasks match the current filters.'}
          </div>
        )}
        {filtered.map((a) => {
          const due  = fmtDate(a.due_at)
          const done = !!a.completed_at
          const assignee = teamMembers.find((m) => m.id === a.assigned_to)
          return (
            <div
              key={a.id}
              onClick={() => setSelectedActivity(a)}
              className={cn(
                'rounded-xl border border-border bg-card p-3.5 transition-colors',
                done ? 'opacity-50' : 'active:bg-muted/40',
                !done && due.bucket === 'past'  && 'border-l-2 border-l-red-500',
                !done && due.bucket === 'today' && 'border-l-2 border-l-amber-500',
              )}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleDone(a) }}
                  className={cn('mt-0.5 shrink-0', done ? 'text-emerald-500' : 'text-muted-foreground')}
                  title={done ? 'Mark open' : 'Mark done'}
                >
                  {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
                      a.type === 'callback' ? 'bg-blue-500/10 text-blue-600' : 'bg-violet-500/10 text-violet-600'
                    )}>
                      {a.type === 'callback' ? <Phone className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {a.type === 'callback' ? 'Call Back' : 'Follow-up'}
                    </span>
                    <span className={cn('ml-auto flex items-center gap-1 text-[11px] font-medium', due.bucket === 'past' ? 'text-red-500' : 'text-muted-foreground')}>
                      <Clock className="h-3 w-3 shrink-0" />{due.label}
                    </span>
                  </div>
                  <p className={cn('mt-1.5 font-medium text-sm', done && 'line-through text-muted-foreground')}>{a.title}</p>
                  {a.lead && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {leadName(a.lead)}{a.lead.company ? ` · ${a.lead.company}` : ''}
                    </p>
                  )}
                  {a.lead?.phone && <p className="mt-0.5 text-xs text-muted-foreground font-mono">{a.lead.phone}</p>}
                  {isAdmin && assignee && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><User className="h-3 w-3" />{assignee.name}</p>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteActivity(a.id) }}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Table — desktop only (mobile uses the card list above) */}
      <div className="hidden lg:block rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Task</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Contact</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Company</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Phone</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Due</th>
              {isAdmin && <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Rep</th>}
              <th className="w-8 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-muted-foreground text-sm">
                  {activities.length === 0 ? 'No tasks yet.' : 'No tasks match the current filters.'}
                </td>
              </tr>
            )}
            {filtered.map((a) => {
              const due   = fmtDate(a.due_at)
              const done  = !!a.completed_at
              const linger = justCompleted.has(a.id)
              const assignee = teamMembers.find((m) => m.id === a.assigned_to)

              // Color buckets only apply when the follow-up is open (not done).
              // `linger` (just-completed flash) and selected-row highlight take
              // precedence over the bucket tint.
              const bucketTint = !done && !linger && selectedActivity?.id !== a.id
                ? due.bucket === 'past'
                  ? 'bg-red-50/60 dark:bg-red-950/15 border-l-2 border-l-red-500'
                  : due.bucket === 'today'
                  ? 'bg-amber-50/60 dark:bg-amber-950/15 border-l-2 border-l-amber-500'
                  : ''
                : ''

              return (
                <tr
                  key={a.id}
                  onClick={() => setSelectedActivity(a)}
                  className={cn(
                    'group transition-all cursor-pointer',
                    done && !linger ? 'opacity-40' : 'hover:bg-muted/30',
                    bucketTint,
                    linger && 'bg-emerald-50/50 dark:bg-emerald-950/20',
                    selectedActivity?.id === a.id && 'bg-primary/5'
                  )}
                >
                  {/* Complete toggle */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleDone(a)}
                      className={cn(
                        'transition-all',
                        done ? 'text-emerald-500' : 'text-muted-foreground hover:text-primary'
                      )}
                      title={done ? 'Mark open' : 'Mark done'}
                    >
                      {done
                        ? <CheckCircle2 className={cn('h-4 w-4', linger && 'scale-110')} />
                        : <Circle className="h-4 w-4" />
                      }
                    </button>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                      a.type === 'callback' ? 'bg-blue-500/10 text-blue-600' : 'bg-violet-500/10 text-violet-600'
                    )}>
                      {a.type === 'callback' ? <Phone className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {a.type === 'callback' ? 'Call Back' : 'Follow-up'}
                    </span>
                  </td>

                  {/* Task */}
                  <td className="px-3 py-3 max-w-[180px]">
                    <p className={cn('truncate font-medium text-sm', done && 'line-through text-muted-foreground')}>
                      {a.title}
                    </p>
                    {a.notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.notes}</p>
                    )}
                  </td>

                  {/* Contact */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {a.lead ? (
                      <Link href={`/leads/${a.lead.id}`} className="font-medium hover:text-primary hover:underline underline-offset-2 text-sm">
                        {leadName(a.lead)}
                      </Link>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Company */}
                  <td className="px-3 py-3 text-sm text-muted-foreground">{a.lead?.company ?? '—'}</td>

                  {/* Phone */}
                  <td className="px-3 py-3 text-xs text-muted-foreground font-mono">{a.lead?.phone ?? '—'}</td>

                  {/* Due */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={cn('flex items-center gap-1 text-xs font-medium', due.bucket === 'past' ? 'text-red-500' : 'text-muted-foreground')}>
                      <Clock className="h-3 w-3 shrink-0" />
                      {due.label}
                    </span>
                  </td>

                  {/* Rep (admin only) */}
                  {isAdmin && (
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        {assignee?.name ?? '—'}
                      </span>
                    </td>
                  )}

                  {/* Delete */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => deleteActivity(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      title="Delete"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Lead full panel — opened when clicking an activity row (list view) */}
      {selectedActivity?.lead && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelectedActivity(null)} />
          <LeadFullPanel
            leadId={selectedActivity.lead.id}
            teamMembers={panelTeamMembers}
            isAdmin={isAdmin ?? false}
            currentUserId={currentUserId}
            canEditBatch={isAdmin ?? false}
            onClose={() => setSelectedActivity(null)}
            onLeadChange={() => {}}
            activityDone={!!selectedActivity.completed_at}
            onMarkActivityDone={() => toggleDone(selectedActivity)}
          />
        </>
      )}

      {/* New Task Dialog */}
      <Dialog open={showNew} onClose={() => setShowNew(false)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <SelectMenu
                  value={newForm.type}
                  onChange={(v) => setNewForm((f) => ({ ...f, type: v as ActivityType }))}
                  options={[
                    { value: 'follow_up', label: 'Follow-up' },
                    { value: 'callback',  label: 'Call Back'  },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <SelectMenu
                  value={newForm.priority}
                  onChange={(v) => setNewForm((f) => ({ ...f, priority: v as Priority }))}
                  options={[
                    { value: 'high',   label: 'High'   },
                    { value: 'medium', label: 'Medium' },
                    { value: 'low',    label: 'Low'    },
                  ]}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Call back about proposal" value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Lead ID <span className="text-destructive">*</span></Label>
                <Input placeholder="Paste lead ID from the URL" value={newForm.leadId} onChange={(e) => setNewForm((f) => ({ ...f, leadId: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Open a lead and copy the ID from the URL bar.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <CalendarPicker
                      value={newForm.dueDate}
                      onChange={(v) => setNewForm((f) => ({ ...f, dueDate: v }))}
                    />
                  </div>
                  {!newForm.noTime && (
                    <TimePicker
                      value={newForm.dueTime}
                      onChange={(v) => setNewForm((f) => ({ ...f, dueTime: v }))}
                      disabledSlots={takenSlots}
                    />
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newForm.noTime}
                    onChange={(e) => setNewForm((f) => ({ ...f, noTime: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                  No specific time (all day)
                </label>
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Assign to</Label>
                  <SelectMenu
                    value={newForm.assignedTo}
                    onChange={(v) => setNewForm((f) => ({ ...f, assignedTo: v }))}
                    searchable={teamMembers.length > 5}
                    options={teamMembers.map((m) => ({ value: m.id, label: m.name }))}
                  />
                </div>
              )}
              <div className={cn('space-y-1.5', isAdmin ? '' : 'col-span-2')}>
                <Label>Notes</Label>
                <textarea
                  placeholder="Optional notes…"
                  value={newForm.notes}
                  onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newForm.title.trim() || !newForm.leadId || saving} loading={saving}>
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </>}</>

      {/* ── Calendar day detail panel ── */}
      {pageView === 'calendar' && calendarDay && (() => {
        const dayKey  = toLocalDateKey(calendarDay)
        const dayActs = calendarFiltered.filter(a => toLocalDateKey(new Date(a.due_at)) === dayKey)
        const dateLabel = calendarDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        const panelW = 380
        return (
          <>
            {/* Backdrop — closes day panel (and lead panel) */}
            <div
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => { setCalendarDay(null); setCalendarLeadId(null) }}
            />

            {/* Day detail panel */}
            <div
              className="fixed top-0 right-0 z-50 flex h-full flex-col border-l border-border bg-card shadow-2xl"
              style={{ width: panelW, maxWidth: '100vw' }}
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Day view</p>
                  <h3 className="mt-0.5 text-[15px] font-bold tracking-[-0.02em]">{dateLabel}</h3>
                </div>
                <button
                  onClick={() => { setCalendarDay(null); setCalendarLeadId(null) }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {dayActs.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No tasks on this day.</p>
                )}
                {dayActs.map((a) => {
                  const done = !!a.completed_at
                  const typeColor = a.type === 'callback'
                    ? 'bg-blue-100 text-blue-800'
                    : a.priority === 'high' ? 'bg-red-100 text-red-800'
                    : a.priority === 'low'  ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-violet-100 text-violet-800'
                  const isOpenLead = calendarLeadId === a.lead?.id
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        'rounded-2xl border border-border bg-background p-4 transition-colors',
                        isOpenLead && 'border-foreground/20 ring-2 ring-foreground/10',
                        done && 'opacity-60',
                      )}
                    >
                      {/* Header row: time + type + mark done */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-semibold text-muted-foreground">{isUntimed(new Date(a.due_at)) ? 'All day' : fmtTime(a.due_at)}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', typeColor)}>
                          {a.type === 'callback' ? 'Call Back' : 'Follow-up'}
                        </span>
                        <button
                          onClick={() => toggleDone(a)}
                          title={done ? 'Mark open' : 'Mark done'}
                          className={cn(
                            'ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold border transition-all',
                            done
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-border bg-background text-muted-foreground hover:border-emerald-300 hover:text-emerald-700'
                          )}
                        >
                          {done
                            ? <><CheckCircle2 className="h-3 w-3" /> Done</>
                            : <><Circle className="h-3 w-3" /> Mark done</>
                          }
                        </button>
                      </div>

                      <p className={cn('text-[13px] font-semibold leading-snug', done && 'line-through text-muted-foreground')}>
                        {a.title}
                      </p>
                      {a.notes && (
                        <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">{a.notes}</p>
                      )}
                      {a.lead && (
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold truncate">{leadName(a.lead)}</p>
                            {a.lead.company && (
                              <p className="text-[11px] text-muted-foreground truncate">{a.lead.company}</p>
                            )}
                          </div>
                          <button
                            onClick={() => setCalendarLeadId(a.lead!.id)}
                            className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground hover:shadow-sm transition-all"
                          >
                            Open Lead →
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Lead panel — opens to the LEFT of the day panel */}
            {calendarLeadId && (
              <LeadFullPanel
                leadId={calendarLeadId}
                teamMembers={panelTeamMembers}
                isAdmin={isAdmin ?? false}
                currentUserId={currentUserId}
                canEditBatch={isAdmin ?? false}
                onClose={() => setCalendarLeadId(null)}
                onLeadChange={() => {}}
                style={{ right: panelW, zIndex: 51 }}
              />
            )}
          </>
        )
      })()}
    </div>
  )
}
