'use client'

import * as React from 'react'
import {
  Calendar, Plus, CheckCircle2, Clock,
  Trash2, Pencil, User, Phone, Mail, FileText,
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
  const [addOpen,  setAddOpen]  = React.useState(false)
  const [editing,  setEditing]  = React.useState<FollowUp | null>(null)

  const pending   = followUps.filter((f) => !f.is_completed)
  const completed = followUps.filter((f) =>  f.is_completed)

  return (
    <div className="space-y-3">
      {pending.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-6 text-center">
          <Calendar className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No pending follow-ups</p>
        </div>
      ) : (
        <div className="space-y-2">
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

// ── Individual follow-up item ─────────────────────────────────────────────
function FollowUpItem({ followUp, onComplete, onDelete, onEdit }: {
  followUp: FollowUp; onComplete: (id: string) => void; onDelete: (id: string) => void; onEdit: () => void
}) {
  const isOverdue = !followUp.is_completed && new Date(followUp.due_at) < new Date()
  return (
    <div className={cn(
      'group flex items-start gap-3 rounded-xl border p-3 transition-colors',
      isOverdue ? 'border-border bg-secondary' : 'border-border hover:bg-muted/30'
    )}>
      <Checkbox checked={followUp.is_completed} onChange={() => onComplete(followUp.id)} className="mt-0.5" aria-label="Mark complete" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn('text-sm font-medium leading-tight', followUp.is_completed && 'line-through text-muted-foreground')}>
          {followUp.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn('flex items-center gap-1 text-xs', isOverdue ? 'text-foreground font-medium' : 'text-muted-foreground')}>
            <Clock className="h-3 w-3 shrink-0" />
            {isOverdue ? 'Overdue · ' : ''}{formatDue(followUp.due_at)}
          </span>
          {followUp.assigned_name && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />{followUp.assigned_name}
            </span>
          )}
        </div>
        {followUp.notes && <p className="text-xs text-muted-foreground leading-relaxed">{followUp.notes}</p>}
      </div>
      <div className="mt-0.5 flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(followUp.id)}
          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Completed section ─────────────────────────────────────────────────────
function CompletedSection({ items, onDelete }: { items: FollowUp[]; onDelete: (id: string) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />
        {open ? 'Hide' : 'Show'} {items.length} completed
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {items.map((f) => (
            <div key={f.id} className="group flex items-start gap-3 rounded-xl border border-border/50 p-3 opacity-60">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm line-through text-muted-foreground">{f.title}</p>
                {f.completed_at && (
                  <p className="text-xs text-muted-foreground">Completed {shortDate(f.completed_at)}</p>
                )}
              </div>
              <button type="button" onClick={() => onDelete(f.id)}
                className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Follow-up types ───────────────────────────────────────────────────────
const FOLLOW_UP_TYPES = [
  { id: 'callback', label: 'Call Back',      icon: Phone,    title: 'Call back' },
  { id: 'email',    label: 'Email',           icon: Mail,     title: 'Send email follow-up' },
  { id: 'other',    label: 'Other',           icon: FileText, title: '' },
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
  const [dueAt,      setDueAt]      = React.useState(defaultDueAt())
  const [assignedTo, setAssignedTo] = React.useState(currentUserId)
  const [saving,     setSaving]     = React.useState(false)
  const [error,      setError]      = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setType('callback')
      setTitle(FOLLOW_UP_TYPES[0].title)
      setNotes(''); setDueAt(defaultDueAt())
      setAssignedTo(currentUserId); setError(null)
    }
  }, [open, currentUserId])

  function handleTypeChange(t: FollowUpType) {
    setType(t)
    const meta = FOLLOW_UP_TYPES.find(f => f.id === t)!
    if (meta.title) setTitle(meta.title)
  }

  async function handleSave() {
    const effectiveTitle = title.trim() || FOLLOW_UP_TYPES.find(f => f.id === type)?.label || 'Follow-up'
    if (!dueAt) { setError('Please set a follow-up date.'); return }
    setSaving(true)
    try {
      await onSave({
        title:       effectiveTitle,
        notes,
        due_at:      dueAt,
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
            <Calendar className="h-4 w-4 text-foreground" />
            Add Follow-up
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6">
          {/* Type selector */}
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
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null) }}
            />
          </div>

          {/* Due date — full width, prominent */}
          <div className="space-y-1.5">
            <Label>Follow-up date & time <span className="text-destructive">*</span></Label>
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => { setDueAt(e.target.value); setError(null) }}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context or reminders…"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Assign to — admins only */}
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
          <Button onClick={handleSave} disabled={saving || !dueAt}>
            {saving ? 'Saving…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Edit follow-up modal ──────────────────────────────────────────────────
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
  const [dueAt,      setDueAt]      = React.useState(followUp.due_at.slice(0, 16))
  const [assignedTo, setAssignedTo] = React.useState(followUp.assigned_to ?? currentUserId)
  const [saving,     setSaving]     = React.useState(false)
  const [error,      setError]      = React.useState<string | null>(null)

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (!dueAt)        { setError('Please set a date.'); return }
    setSaving(true)
    try {
      await onSave({ title: title.trim(), notes, due_at: dueAt, assigned_to: assignedTo })
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

        <div className="space-y-4 px-6">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null) }}
              placeholder="What needs to be done?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Follow-up date & time <span className="text-destructive">*</span></Label>
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => { setDueAt(e.target.value); setError(null) }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
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
          <Button onClick={handleSave} disabled={saving || !dueAt || !title.trim()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────
function defaultDueAt(): string {
  const d = new Date(Date.now() + 24 * 3600000)
  d.setMinutes(0, 0, 0)
  return d.toISOString().slice(0, 16)
}

function formatDue(iso: string): string {
  const d    = new Date(iso)
  const now  = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.round(diff / 86400000)
  if (days < 0)   return `${Math.abs(days)}d overdue`
  if (days === 0)  return 'Due today'
  if (days === 1)  return 'Due tomorrow'
  if (days < 7)   return `Due in ${days}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
