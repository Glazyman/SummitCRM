'use client'

import * as React from 'react'
import {
  UserPlus, FileDown, RefreshCw, StickyNote,
  Mail, Eye, MousePointer, Reply, AlertTriangle,
  Sparkles, Calendar, Send, CheckCircle2,
  BellOff, Pencil, Trash2, Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_CONFIG } from '@/components/leads/status-config'
import type { ActivityEntry, ActivityType, LeadStatus } from './types'

interface ActivityTimelineProps {
  entries:           ActivityEntry[]
  onEditNote:        (noteId: string, content: string) => void
  onDeleteNote:      (noteId: string) => void
}

// ── Icon + color config per activity type ─────────────────────────────────
type ActivityMeta = {
  icon:    React.ComponentType<{ className?: string }>
  ring:    string   // ring color class
  bg:      string   // icon bg class
  color:   string   // icon color class
  label:   string
}

const ACTIVITY_META: Record<ActivityType, ActivityMeta> = {
  lead_created:        { icon: UserPlus,       ring: 'ring-border',     bg: 'bg-secondary',     color: 'text-foreground',    label: 'Lead created' },
  lead_imported:       { icon: FileDown,        ring: 'ring-border',     bg: 'bg-secondary',     color: 'text-foreground',    label: 'Lead imported' },
  lead_status_changed: { icon: RefreshCw,       ring: 'ring-border', bg: 'bg-secondary', color: 'text-foreground',label: 'Status changed' },
  note_added:          { icon: StickyNote,      ring: 'ring-border',   bg: 'bg-secondary',   color: 'text-foreground',  label: 'Note added' },
  note_edited:         { icon: StickyNote,      ring: 'ring-border',   bg: 'bg-secondary',   color: 'text-foreground',  label: 'Note edited' },
  note_deleted:        { icon: Trash2,          ring: 'ring-gray-200',     bg: 'bg-gray-100',        color: 'text-gray-500',                       label: 'Note deleted' },
  email_sent:          { icon: Mail,            ring: 'ring-border',       bg: 'bg-secondary',       color: 'text-foreground',      label: 'Email sent' },
  email_opened:        { icon: Eye,             ring: 'ring-border',   bg: 'bg-secondary',   color: 'text-foreground',  label: 'Email opened' },
  email_clicked:       { icon: MousePointer,    ring: 'ring-border',     bg: 'bg-secondary',     color: 'text-foreground',    label: 'Link clicked' },
  email_replied:       { icon: Reply,           ring: 'ring-border',bg: 'bg-secondary',color: 'text-foreground',label: 'Email replied' },
  email_bounced:       { icon: AlertTriangle,   ring: 'ring-border',       bg: 'bg-secondary',       color: 'text-foreground',      label: 'Email bounced' },
  ai_draft_generated:  { icon: Sparkles,        ring: 'ring-border', bg: 'bg-secondary', color: 'text-foreground',label: 'AI draft generated' },
  follow_up_scheduled: { icon: Calendar,        ring: 'ring-border', bg: 'bg-secondary', color: 'text-foreground',label: 'Follow-up scheduled' },
  follow_up_sent:      { icon: Send,            ring: 'ring-border',       bg: 'bg-secondary',       color: 'text-foreground',      label: 'Follow-up sent' },
  follow_up_completed: { icon: CheckCircle2,    ring: 'ring-border',   bg: 'bg-secondary',   color: 'text-foreground',  label: 'Follow-up completed' },
  unsubscribed:        { icon: BellOff,         ring: 'ring-border',       bg: 'bg-secondary',       color: 'text-foreground',      label: 'Unsubscribed' },
  member_invited:      { icon: UserPlus,        ring: 'ring-border',     bg: 'bg-secondary',     color: 'text-foreground',    label: 'Member invited' },
  role_changed:        { icon: RefreshCw,       ring: 'ring-gray-200',     bg: 'bg-gray-100',        color: 'text-gray-500',                       label: 'Role changed' },
}

// ── Main component ─────────────────────────────────────────────────────────
export function ActivityTimeline({
  entries,
  onEditNote,
  onDeleteNote,
}: ActivityTimelineProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <RefreshCw className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    )
  }

  return (
    <div className="relative space-y-0">
      {entries.map((entry, idx) => (
        <TimelineEntry
          key={entry.id}
          entry={entry}
          isLast={idx === entries.length - 1}
          onEditNote={onEditNote}
          onDeleteNote={onDeleteNote}
        />
      ))}
    </div>
  )
}

// ── Single timeline entry ──────────────────────────────────────────────────
function TimelineEntry({
  entry,
  isLast,
  onEditNote,
  onDeleteNote,
}: {
  entry:        ActivityEntry
  isLast:       boolean
  onEditNote:   (id: string, content: string) => void
  onDeleteNote: (id: string) => void
}) {
  const FALLBACK_META: ActivityMeta = {
    icon:  Activity,
    ring:  'ring-gray-200',
    bg:    'bg-gray-100',
    color: 'text-gray-500',
    label: 'Activity',
  }
  const meta = ACTIVITY_META[entry.type] ?? FALLBACK_META
  const Icon = meta.icon

  return (
    <div className="group relative flex gap-3 pb-5">
      {/* Vertical connector line */}
      {!isLast && (
        <div className="absolute left-4 top-8 bottom-0 w-px bg-border" aria-hidden />
      )}

      {/* Icon bubble */}
      <div className={cn(
        'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2',
        meta.bg,
        meta.ring
      )}>
        <Icon className={cn('h-3.5 w-3.5', meta.color)} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
          <EntryBody entry={entry} />
          <time
            className="shrink-0 text-xs text-muted-foreground tabular-nums"
            dateTime={entry.created_at}
          >
            {relativeTime(entry.created_at)}
          </time>
        </div>

        {/* User attribution */}
        {entry.user_name && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            by {entry.user_name}
          </p>
        )}

        {/* Note content (expanded) */}
        {entry.source === 'note' && entry.note_content && (
          <NoteContent
            noteId={entry.note_id!}
            content={entry.note_content}
            editable={entry.note_editable ?? false}
            onEdit={onEditNote}
            onDelete={onDeleteNote}
          />
        )}
      </div>
    </div>
  )
}

// ── Entry body text per type ──────────────────────────────────────────────
function EntryBody({ entry }: { entry: ActivityEntry }) {
  const m = entry.metadata

  switch (entry.type) {
    case 'lead_created':
      return <span className="text-sm font-medium">Lead created manually</span>

    case 'lead_imported':
      return (
        <span className="text-sm">
          <span className="font-medium">Imported</span>
          {m.batch_name ? ` into batch "${m.batch_name as string}"` : ''}
          {m.file_name  ? ` from ${m.file_name as string}` : ''}
        </span>
      )

    case 'lead_status_changed': {
      const from = (m.from as LeadStatus) ?? 'new'
      const to   = (m.to   as LeadStatus) ?? 'new'
      const fromMeta = STATUS_CONFIG[from]
      const toMeta   = STATUS_CONFIG[to]
      return (
        <span className="flex flex-wrap items-center gap-1 text-sm">
          <span className="font-medium">Status changed</span>
          <span className={cn('rounded-full border px-2 py-px text-xs font-medium', fromMeta?.badge ?? '')}>
            {fromMeta?.label ?? from}
          </span>
          →
          <span className={cn('rounded-full border px-2 py-px text-xs font-medium', toMeta?.badge ?? '')}>
            {toMeta?.label ?? to}
          </span>
        </span>
      )
    }

    case 'note_added':
      return <span className="text-sm font-medium">Added a note</span>
    case 'note_edited':
      return <span className="text-sm font-medium">Edited a note</span>

    case 'note_deleted':
      return <span className="text-sm text-muted-foreground">Note deleted</span>

    case 'email_sent':
      return (
        <span className="text-sm">
          <span className="font-medium">Sent email: </span>
          <span className="text-muted-foreground">{m.subject as string}</span>
        </span>
      )

    case 'email_opened':
      return (
        <span className="text-sm">
          <span className="font-medium">Opened email: </span>
          <span className="text-muted-foreground">{m.subject as string}</span>
        </span>
      )

    case 'email_clicked':
      return (
        <span className="text-sm">
          <span className="font-medium">Clicked link in: </span>
          <span className="text-muted-foreground">{m.subject as string}</span>
        </span>
      )

    case 'email_replied':
      return (
        <span className="text-sm">
          <span className="font-medium text-foreground">Replied</span>
          {!!m.subject && <span className="text-muted-foreground"> to &ldquo;{m.subject as string}&rdquo;</span>}
        </span>
      )

    case 'email_bounced':
      return (
        <span className="text-sm">
          <span className="font-medium text-destructive">Email bounced</span>
          {!!m.reason && <span className="text-muted-foreground"> — {m.reason as string}</span>}
        </span>
      )

    case 'ai_draft_generated':
      return <span className="text-sm font-medium">AI draft generated</span>

    case 'follow_up_scheduled':
      return (
        <span className="text-sm">
          <span className="font-medium">Follow-up scheduled: </span>
          <span className="text-muted-foreground">{m.title as string}</span>
          {!!m.due_at && (
            <span className="ml-1 text-muted-foreground">
              (due {formatDate(m.due_at as string)})
            </span>
          )}
        </span>
      )

    case 'follow_up_sent':
      return <span className="text-sm font-medium">Follow-up sent</span>

    case 'follow_up_completed':
      return (
        <span className="text-sm">
          <span className="font-medium text-foreground">Follow-up completed: </span>
          <span className="text-muted-foreground">{m.title as string}</span>
        </span>
      )

    case 'unsubscribed':
      return <span className="text-sm font-medium text-destructive">Lead unsubscribed</span>

    default:
      return <span className="text-sm capitalize">{entry.type.replace(/_/g, ' ')}</span>
  }
}

// ── Inline note display ────────────────────────────────────────────────────
function NoteContent({
  noteId, content, editable, onEdit, onDelete,
}: {
  noteId:   string
  content:  string
  editable: boolean
  onEdit:   (id: string, c: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft,   setDraft]   = React.useState(content)
  const MAX = 5000

  function handleSave() {
    if (!draft.trim()) return
    onEdit(noteId, draft.trim())
    setEditing(false)
  }

  return (
    <div className="group/note mt-2 rounded-xl border border-border bg-secondary p-3">
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX}
            rows={4}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{draft.length}/{MAX}</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { setEditing(false); setDraft(content) }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Save note
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{content}</p>
          {editable && (
            <div className="flex shrink-0 gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => { setDraft(content); setEditing(true) }}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(noteId)}
                className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  if (days  < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
