'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  Calendar as CalendarIcon, Plus, CheckCircle2, Clock,
  Trash2, Pencil, User, Phone, Mail, FileText,
  ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import type { FollowUp, NewFollowUp, TeamMember } from './types'

interface EditFollowUpData {
  title:       string
  notes:       string
  due_at:      string
  assigned_to: string
}

interface FollowUpSectionProps {
  followUps:     FollowUp[]
  teamMembers:   TeamMember[]
  currentUserId: string
  isAdmin?:      boolean
  onAdd:         (data: NewFollowUp) => Promise<void>
  onEdit:        (id: string, data: EditFollowUpData) => Promise<void>
  onComplete:    (id: string) => void
  onDelete:      (id: string) => void
}

export function FollowUpSection({
  followUps, teamMembers, currentUserId, isAdmin,
  onAdd, onEdit, onComplete, onDelete,
}: FollowUpSectionProps) {
  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<FollowUp | null>(null)

  const pending   = followUps.filter((f) => !f.is_completed)
  const completed = followUps.filter((f) =>  f.is_completed)

  return (
    <div className="space-y-3">
      {pending.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
          <CalendarIcon className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No pending follow-ups</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pending.map((f) => (
            <FollowUpItem
              key={f.id}
              followUp={f}
              onComplete={onComplete}
              onDelete={onDelete}
              onEdit={() => setEditing(f)}
            />
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" className="w-full gap-1.5 border-dashed" onClick={() => setAddOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add Follow-up
      </Button>

      {completed.length > 0 && <CompletedSection items={completed} onDelete={onDelete} />}

      <AddFollowUpModal
        open={addOpen}
        teamMembers={teamMembers}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onClose={() => setAddOpen(false)}
        onSave={async (data) => { await onAdd(data); setAddOpen(false) }}
      />

      {editing && (
        <EditFollowUpModal
          followUp={editing}
          teamMembers={teamMembers}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSave={async (data) => { await onEdit(editing.id, data); setEditing(null) }}
        />
      )}
    </div>
  )
}

// ── Individual follow-up item ──────────────────────────────────────────────
function FollowUpItem({ followUp, onComplete, onDelete, onEdit }: {
  followUp:   FollowUp
  onComplete: (id: string) => void
  onDelete:   (id: string) => void
  onEdit:     () => void
}) {
  const isOverdue = !followUp.is_completed && new Date(followUp.due_at) < new Date()

  return (
    <div className={cn(
      'group relative flex items-start gap-3.5 rounded-xl border p-4 transition-colors overflow-hidden',
      isOverdue
        ? 'border-orange-200 bg-orange-50/60 dark:border-orange-900/40 dark:bg-orange-900/10'
        : 'border-border bg-card hover:bg-muted/20',
    )}>
      {/* Left accent for overdue */}
      {isOverdue && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-orange-400" />
      )}

      <Checkbox
        checked={followUp.is_completed}
        onChange={() => onComplete(followUp.id)}
        className="mt-0.5 shrink-0"
        aria-label="Mark complete"
      />

      <div className="min-w-0 flex-1 space-y-1.5">
        <p className={cn(
          'text-sm font-semibold leading-snug',
          followUp.is_completed && 'line-through text-muted-foreground',
        )}>
          {followUp.title}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Due date chip */}
          <span className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
            isOverdue
              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
              : 'bg-muted text-muted-foreground',
          )}>
            {isOverdue && <AlertCircle className="h-2.5 w-2.5" />}
            <Clock className="h-2.5 w-2.5" />
            {formatDue(followUp.due_at)}
          </span>

          {/* Assigned */}
          {followUp.assigned_name && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <User className="h-2.5 w-2.5" />
              {followUp.assigned_name}
            </span>
          )}
        </div>

        {followUp.notes && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {followUp.notes}
          </p>
        )}
      </div>

      {/* Actions — always visible on touch, hover-reveal on desktop */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(followUp.id)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Completed section ──────────────────────────────────────────────────────
function CompletedSection({ items, onDelete }: { items: FollowUp[]; onDelete: (id: string) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        {open ? 'Hide' : 'Show'} {items.length} completed
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {items.map((f) => (
            <div key={f.id} className="group flex items-start gap-3 rounded-xl border border-border/50 bg-card p-3.5 opacity-60">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm line-through text-muted-foreground">{f.title}</p>
                {f.completed_at && (
                  <p className="mt-0.5 text-xs text-muted-foreground">Completed {shortDate(f.completed_at)}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(f.id)}
                className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Follow-up types ────────────────────────────────────────────────────────
const FOLLOW_UP_TYPES = [
  { id: 'callback', label: 'Call Back',  icon: Phone,    title: 'Call back'              },
  { id: 'email',    label: 'Email',      icon: Mail,     title: 'Send email follow-up'   },
  { id: 'other',    label: 'Other',      icon: FileText, title: ''                       },
] as const

type FollowUpType = typeof FOLLOW_UP_TYPES[number]['id']

// ── Add follow-up modal ────────────────────────────────────────────────────
interface AddFollowUpModalProps {
  open:          boolean
  teamMembers:   TeamMember[]
  currentUserId: string
  isAdmin?:      boolean
  onClose:       () => void
  onSave:        (data: NewFollowUp) => Promise<void>
}

function AddFollowUpModal({ open, teamMembers, currentUserId, isAdmin, onClose, onSave }: AddFollowUpModalProps) {
  const [type,       setType]       = React.useState<FollowUpType>('callback')
  const [title,      setTitle]      = React.useState('')
  const [notes,      setNotes]      = React.useState('')
  const [dueDate,    setDueDate]    = React.useState(() => splitDateTime(defaultDueAt()).date)
  const [dueTime,    setDueTime]    = React.useState(() => splitDateTime(defaultDueAt()).time)
  const [assignedTo, setAssignedTo] = React.useState(currentUserId)
  const [saving,     setSaving]     = React.useState(false)
  const [error,      setError]      = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setType('callback')
      setTitle(FOLLOW_UP_TYPES[0].title)
      setNotes('')
      const def = splitDateTime(defaultDueAt())
      setDueDate(def.date)
      setDueTime(def.time)
      setAssignedTo(currentUserId)
      setError(null)
    }
  }, [open, currentUserId])

  function handleTypeChange(t: FollowUpType) {
    setType(t)
    const meta = FOLLOW_UP_TYPES.find((f) => f.id === t)!
    if (meta.title) setTitle(meta.title)
  }

  async function handleSave() {
    const effectiveTitle = title.trim() || FOLLOW_UP_TYPES.find((f) => f.id === type)?.label || 'Follow-up'
    if (!dueDate) { setError('Please set a follow-up date.'); return }
    setSaving(true)
    try {
      await onSave({
        title:       effectiveTitle,
        notes,
        due_at:      new Date(joinDateTime(dueDate, dueTime || '09:00')).toISOString(),
        assigned_to: isAdmin ? assignedTo : currentUserId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-foreground" />
            Add Follow-up
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6">
          {/* Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {FOLLOW_UP_TYPES.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTypeChange(t.id)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 text-xs font-medium transition-all',
                      type === t.id
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null) }}
            />
          </div>

          {/* Date & time */}
          <div className="space-y-1.5">
            <Label>
              Date & time <span className="text-destructive">*</span>
            </Label>
            <DateTimePicker
              date={dueDate}
              time={dueTime}
              onDateChange={(v) => { setDueDate(v); setError(null) }}
              onTimeChange={(v) => { setDueTime(v); setError(null) }}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>
              Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context or reminders…"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Assign */}
          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !dueDate}>
            {saving ? 'Saving…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Edit follow-up modal ───────────────────────────────────────────────────
interface EditFollowUpModalProps {
  followUp:      FollowUp
  teamMembers:   TeamMember[]
  currentUserId: string
  isAdmin?:      boolean
  onClose:       () => void
  onSave:        (data: EditFollowUpData) => Promise<void>
}

function EditFollowUpModal({ followUp, teamMembers, currentUserId, isAdmin, onClose, onSave }: EditFollowUpModalProps) {
  const [title,      setTitle]      = React.useState(followUp.title)
  const [notes,      setNotes]      = React.useState(followUp.notes ?? '')
  const [dueDate,    setDueDate]    = React.useState(() => splitDateTime(toLocalDatetimeInput(new Date(followUp.due_at))).date)
  const [dueTime,    setDueTime]    = React.useState(() => splitDateTime(toLocalDatetimeInput(new Date(followUp.due_at))).time)
  const [assignedTo, setAssignedTo] = React.useState(followUp.assigned_to ?? currentUserId)
  const [saving,     setSaving]     = React.useState(false)
  const [error,      setError]      = React.useState<string | null>(null)

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!dueDate)      { setError('Please set a date.');  return }
    setSaving(true)
    try {
      await onSave({
        title:       title.trim(),
        notes,
        due_at:      new Date(joinDateTime(dueDate, dueTime || '09:00')).toISOString(),
        assigned_to: assignedTo,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-foreground" />
            Edit Follow-up
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null) }}
              placeholder="What needs to be done?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Date & time <span className="text-destructive">*</span>
            </Label>
            <DateTimePicker
              date={dueDate}
              time={dueTime}
              onDateChange={(v) => { setDueDate(v); setError(null) }}
              onTimeChange={(v) => { setDueTime(v); setError(null) }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context or reminders…"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !dueDate || !title.trim()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── DateTimePicker ─────────────────────────────────────────────────────────
function DateTimePicker({
  date, time,
  onDateChange, onTimeChange,
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

// ── Calendar picker ────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function CalendarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open,      setOpen]      = React.useState(false)
  const [mounted,   setMounted]   = React.useState(false)
  const btnRef  = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const today = React.useMemo(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
  }, [])

  const [viewYear,  setViewYear]  = React.useState(() => value ? new Date(value + 'T12:00').getFullYear()  : today.year)
  const [viewMonth, setViewMonth] = React.useState(() => value ? new Date(value + 'T12:00').getMonth()     : today.month)

  React.useEffect(() => { setMounted(true) }, [])

  // Sync view to value on open
  React.useEffect(() => {
    if (open && value) {
      const d = new Date(value + 'T12:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [open, value])

  // Position popover
  React.useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return
    const a = btnRef.current.getBoundingClientRect()
    const m = menuRef.current
    const mw = m.offsetWidth  || 280
    const mh = m.offsetHeight || 320
    const pad = 8

    let top  = a.bottom + 4
    if (top + mh > window.innerHeight - pad) top = a.top - mh - 4
    if (top < pad) top = a.bottom + 4

    let left = a.left
    if (left + mw > window.innerWidth - pad) left = a.right - mw
    left = Math.max(pad, left)

    m.style.top  = `${Math.round(top)}px`
    m.style.left = `${Math.round(left)}px`
  }, [open])

  // Outside click + Escape
  React.useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [open])

  // Build calendar grid (always 42 cells = 6 weeks)
  const firstWeekday   = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate()
  const daysInPrevMon  = new Date(viewYear, viewMonth, 0).getDate()

  interface Cell { day: number; dateStr: string; currentMonth: boolean }
  const cells: Cell[] = []

  // Prev-month tail
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = daysInPrevMon - i
    const pm = viewMonth === 0 ? 12 : viewMonth
    const py = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ day: d, dateStr: `${py}-${p2(pm)}-${p2(d)}`, currentMonth: false })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: `${viewYear}-${p2(viewMonth + 1)}-${p2(d)}`, currentMonth: true })
  }
  // Next-month head
  const nm = viewMonth === 11 ? 1 : viewMonth + 2
  const ny = viewMonth === 11 ? viewYear + 1 : viewYear
  for (let d = 1; cells.length < 42; d++) {
    cells.push({ day: d, dateStr: `${ny}-${p2(nm)}-${p2(d)}`, currentMonth: false })
  }

  const todayStr = `${today.year}-${p2(today.month + 1)}-${p2(today.day)}`

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const displayValue = value
    ? new Date(value + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
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
          <div className="flex items-center justify-between mb-2">
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
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
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
                    // Selected
                    isSelected && 'bg-primary text-primary-foreground shadow-sm',
                    // Today (not selected)
                    !isSelected && isToday && 'ring-1 ring-inset ring-primary text-primary font-semibold',
                    // Normal current-month
                    !isSelected && !isToday && cell.currentMonth && 'text-foreground hover:bg-muted',
                    // Other-month days
                    !isSelected && !cell.currentMonth && 'text-muted-foreground/40 hover:bg-muted/50',
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
function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open,    setOpen]    = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const btnRef      = React.useRef<HTMLButtonElement>(null)
  const menuRef     = React.useRef<HTMLDivElement>(null)
  const selectedRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => { setMounted(true) }, [])

  // Scroll selected into view when the menu opens
  React.useEffect(() => {
    if (open && selectedRef.current) {
      // Small delay lets the portal render first
      const t = setTimeout(() => selectedRef.current?.scrollIntoView({ block: 'center' }), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Position
  React.useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return
    const a = btnRef.current.getBoundingClientRect()
    const m = menuRef.current
    const mw  = m.offsetWidth  || 160
    const mh  = m.offsetHeight || 260
    const pad = 8

    let top  = a.bottom + 4
    if (top + mh > window.innerHeight - pad) top = a.top - mh - 4
    if (top < pad) top = a.bottom + 4

    let left = a.left
    if (left + mw > window.innerWidth - pad) left = a.right - mw
    left = Math.max(pad, left)

    m.style.top  = `${Math.round(top)}px`
    m.style.left = `${Math.round(left)}px`
  }, [open])

  // Outside click + Escape
  React.useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [open])

  // Generate 30-min slots from 6 AM to 9:30 PM
  const slots = React.useMemo(() => {
    const out: string[] = []
    for (let h = 6; h <= 21; h++) {
      out.push(`${p2(h)}:00`)
      if (h < 21) out.push(`${p2(h)}:30`)
    }
    out.push('21:30')
    return out
  }, [])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-32 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm transition-colors shrink-0',
          'hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring',
          open && 'ring-2 ring-ring border-ring',
          !value ? 'text-muted-foreground' : 'text-foreground',
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
            {slots.map((slot) => {
              const isSelected = slot === value
              return (
                <button
                  key={slot}
                  ref={isSelected ? selectedRef : undefined}
                  type="button"
                  onClick={() => { onChange(slot); setOpen(false) }}
                  className={cn(
                    'flex w-full items-center px-4 py-1.5 text-sm transition-colors',
                    isSelected
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

// ── Helpers ────────────────────────────────────────────────────────────────

function p2(n: number) { return String(n).padStart(2, '0') }

/** Convert "HH:MM" (24h) → "H:MM AM/PM" */
function fmt12(t: string): string {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr, 10)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${mStr} ${ampm}`
}

function splitDateTime(dt: string): { date: string; time: string } {
  const [date, time] = dt.split('T')
  return { date: date ?? '', time: time?.slice(0, 5) ?? '09:00' }
}

function joinDateTime(date: string, time: string): string {
  return `${date}T${time}`
}

function toLocalDatetimeInput(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

function defaultDueAt(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return toLocalDatetimeInput(d)
}

function formatDue(iso: string): string {
  const d    = new Date(iso)
  const now  = new Date()
  const todayMidnight = new Date(now.getFullYear(),  now.getMonth(),  now.getDate())
  const dueMidnight   = new Date(d.getFullYear(),    d.getMonth(),    d.getDate())
  const days = Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / 86400000)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days < 0)   return `${Math.abs(days)}d overdue`
  if (days === 0) return `Today · ${time}`
  if (days === 1) return `Tomorrow · ${time}`
  if (days < 7)   return `In ${days}d · ${time}`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` · ${time}`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
