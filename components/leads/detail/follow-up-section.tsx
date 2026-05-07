'use client'

import * as React from 'react'
import {
  Calendar, Plus, CheckCircle2, Clock,
  Trash2, User, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import type { FollowUp, NewFollowUp, TeamMember } from './types'

interface FollowUpSectionProps {
  followUps:    FollowUp[]
  teamMembers:  TeamMember[]
  currentUserId:string
  onAdd:        (data: NewFollowUp) => Promise<void>
  onComplete:   (id: string) => void
  onDelete:     (id: string) => void
}

export function FollowUpSection({
  followUps,
  teamMembers,
  currentUserId,
  onAdd,
  onComplete,
  onDelete,
}: FollowUpSectionProps) {
  const [modalOpen, setModalOpen] = React.useState(false)

  const pending   = followUps.filter((f) => !f.is_completed)
  const completed = followUps.filter((f) =>  f.is_completed)

  return (
    <div className="space-y-3">

      {/* Pending follow-ups */}
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
            />
          ))}
        </div>
      )}

      {/* Add button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5 border-dashed"
        onClick={() => setModalOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Follow-up
      </Button>

      {/* Completed (collapsible) */}
      {completed.length > 0 && (
        <CompletedSection items={completed} onDelete={onDelete} />
      )}

      {/* Add modal */}
      <AddFollowUpModal
        open={modalOpen}
        teamMembers={teamMembers}
        currentUserId={currentUserId}
        onClose={() => setModalOpen(false)}
        onSave={async (data) => {
          await onAdd(data)
          setModalOpen(false)
        }}
      />
    </div>
  )
}

// ── Individual follow-up item ──────────────────────────────────────────────
function FollowUpItem({
  followUp,
  onComplete,
  onDelete,
}: {
  followUp:   FollowUp
  onComplete: (id: string) => void
  onDelete:   (id: string) => void
}) {
  const isOverdue = !followUp.is_completed && new Date(followUp.due_at) < new Date()

  return (
    <div className={cn(
      'group flex items-start gap-3 rounded-xl border p-3 transition-colors',
      isOverdue
        ? 'border-red-200 bg-red-50/50 dark:border-red-800/40 dark:bg-red-900/10'
        : 'border-border hover:bg-muted/30'
    )}>
      <Checkbox
        checked={followUp.is_completed}
        onChange={() => onComplete(followUp.id)}
        className="mt-0.5"
        aria-label="Mark complete"
      />

      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn(
          'text-sm font-medium leading-tight',
          followUp.is_completed && 'line-through text-muted-foreground'
        )}>
          {followUp.title}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn(
            'flex items-center gap-1 text-xs',
            isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'
          )}>
            <Clock className="h-3 w-3 shrink-0" />
            {isOverdue ? 'Overdue · ' : ''}{formatDue(followUp.due_at)}
          </span>

          {followUp.assigned_name && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />
              {followUp.assigned_name}
            </span>
          )}
        </div>

        {followUp.notes && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {followUp.notes}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDelete(followUp.id)}
        className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
        aria-label="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Completed section (collapsible) ───────────────────────────────────────
function CompletedSection({
  items,
  onDelete,
}: {
  items:    FollowUp[]
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        {open ? 'Hide' : 'Show'} {items.length} completed
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {items.map((f) => (
            <div
              key={f.id}
              className="group flex items-start gap-3 rounded-xl border border-border/50 p-3 opacity-60"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm line-through text-muted-foreground">{f.title}</p>
                {f.completed_at && (
                  <p className="text-xs text-muted-foreground">
                    Completed {shortDate(f.completed_at)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(f.id)}
                className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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

// ── Add follow-up modal ────────────────────────────────────────────────────
interface AddFollowUpModalProps {
  open:          boolean
  teamMembers:   TeamMember[]
  currentUserId: string
  onClose:       () => void
  onSave:        (data: NewFollowUp) => Promise<void>
}

function AddFollowUpModal({
  open, teamMembers, currentUserId, onClose, onSave,
}: AddFollowUpModalProps) {
  const [title,      setTitle]      = React.useState('')
  const [notes,      setNotes]      = React.useState('')
  const [dueAt,      setDueAt]      = React.useState(defaultDueAt())
  const [assignedTo, setAssignedTo] = React.useState(currentUserId)
  const [saving,     setSaving]     = React.useState(false)
  const [error,      setError]      = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setTitle(''); setNotes(''); setDueAt(defaultDueAt())
      setAssignedTo(currentUserId); setError(null)
    }
  }, [open, currentUserId])

  async function handleSave() {
    if (!title.trim()) { setError('Please enter a title.'); return }
    if (!dueAt)        { setError('Please set a due date.'); return }
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
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-orange-500" />
            Add Follow-up
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6">
          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Send product overview deck"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null) }}
              autoFocus
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context or reminders…"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due date <span className="text-destructive">*</span></Label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>

            {/* Assign to */}
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
          </div>

          {/* AI suggestion */}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-violet-300 py-2 text-xs text-violet-600 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/20 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Suggest timing with AI
          </button>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Add Follow-up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────
function defaultDueAt(): string {
  const d = new Date(Date.now() + 48 * 3600000)
  d.setMinutes(0, 0, 0)
  return d.toISOString().slice(0, 16)
}

function formatDue(iso: string): string {
  const d    = new Date(iso)
  const now  = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.round(diff / 86400000)

  if (days < 0)  return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days < 7)  return `Due in ${days}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
