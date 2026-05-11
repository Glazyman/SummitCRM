'use client'

import * as React from 'react'
import {
  Phone, PhoneOff, PhoneMissed, VoicemailIcon,
  Clock, User, StickyNote, Plus, Pencil, Trash2, X, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CallOutcome } from '@/types/database'

// ── Types ─────────────────────────────────────────────────────────────────
export interface CallLogItem {
  id:           string
  outcome:      CallOutcome
  duration_sec: number | null
  notes:        string | null
  called_at:    string
  logged_by:    string
  logger_name?: string | null
}

interface CallHistoryProps {
  leadId: string
  calls:  CallLogItem[]
}

const OUTCOMES: CallOutcome[] = [
  'answered', 'voicemail', 'no_answer', 'wrong_number', 'callback_requested',
]

const OUTCOME_CONFIG: Record<CallOutcome, { label: string; icon: React.ReactNode; solid: string }> = {
  answered: {
    label: 'Answered',
    icon:  <Phone className="h-3.5 w-3.5" />,
    solid: 'bg-emerald-500 text-white border-emerald-600',
  },
  voicemail: {
    label: 'Voicemail',
    icon:  <VoicemailIcon className="h-3.5 w-3.5" />,
    solid: 'bg-purple-500 text-white border-purple-600',
  },
  no_answer: {
    label: 'No Answer',
    icon:  <PhoneMissed className="h-3.5 w-3.5" />,
    solid: 'bg-slate-500 text-white border-slate-600',
  },
  wrong_number: {
    label: 'Wrong Number',
    icon:  <PhoneOff className="h-3.5 w-3.5" />,
    solid: 'bg-red-500 text-white border-red-600',
  },
  callback_requested: {
    label: 'Callback Requested',
    icon:  <Phone className="h-3.5 w-3.5" />,
    solid: 'bg-amber-500 text-white border-amber-600',
  },
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  )
}

// ── Outcome picker ─────────────────────────────────────────────────────────
function OutcomePicker({
  value,
  onChange,
}: {
  value:    CallOutcome
  onChange: (v: CallOutcome) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OUTCOMES.map((o) => {
        const cfg      = OUTCOME_CONFIG[o]
        const selected = value === o
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all',
              selected
                ? cfg.solid
                : 'border-border bg-background text-muted-foreground hover:border-muted-foreground hover:text-foreground',
            )}
          >
            {cfg.icon}
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export function CallHistory({ leadId, calls }: CallHistoryProps) {
  const [items,      setItems]      = React.useState<CallLogItem[]>(calls)
  const [showAdd,    setShowAdd]    = React.useState(false)
  const [addOutcome, setAddOutcome] = React.useState<CallOutcome>('answered')
  const [addNotes,   setAddNotes]   = React.useState('')
  const [saving,     setSaving]     = React.useState(false)
  const [editingId,  setEditingId]  = React.useState<string | null>(null)
  const [editOutcome,setEditOutcome]= React.useState<CallOutcome>('answered')
  const [editNotes,  setEditNotes]  = React.useState('')
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  // ── Add ────────────────────────────────────────────────────────────────
  async function handleAdd() {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/calls`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ outcome: addOutcome, notes: addNotes || null }),
      })
      const json = await res.json()
      if (res.ok && json.call) {
        setItems((prev) => [json.call, ...prev])
        setShowAdd(false)
        setAddNotes('')
        setAddOutcome('answered')
      }
    } finally {
      setSaving(false)
    }
  }

  function cancelAdd() {
    setShowAdd(false)
    setAddNotes('')
    setAddOutcome('answered')
  }

  // ── Edit ───────────────────────────────────────────────────────────────
  function startEdit(call: CallLogItem) {
    setEditingId(call.id)
    setEditOutcome(call.outcome)
    setEditNotes(call.notes ?? '')
  }

  async function handleEdit(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/calls/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ outcome: editOutcome, notes: editNotes || null }),
      })
      const json = await res.json()
      if (res.ok && json.call) {
        setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...json.call } : c)))
        setEditingId(null)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/leads/${leadId}/calls/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setItems((prev) => prev.filter((c) => c.id !== id))
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">

      {/* ── Add call form / button ───────────────────────────────────── */}
      {!showAdd ? (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Log a call
        </button>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Log a call</p>
          <OutcomePicker value={addOutcome} onChange={setAddOutcome} />
          <textarea
            value={addNotes}
            onChange={(e) => setAddNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={3}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelAdd}
              className="flex h-7 items-center px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
          <Phone className="h-8 w-8 opacity-30" />
          <p className="text-sm">No calls logged yet</p>
          <p className="text-xs text-muted-foreground/60">
            Log one above, or calls are added automatically when you change a lead's status.
          </p>
        </div>
      )}

      {/* ── Call list ────────────────────────────────────────────────── */}
      {items.map((call) => {
        const cfg       = OUTCOME_CONFIG[call.outcome]
        const isEditing = editingId === call.id

        return (
          <div
            key={call.id}
            className="rounded-xl border border-border bg-card p-3"
          >
            {isEditing ? (
              /* ── Inline edit form ── */
              <div className="space-y-3">
                <OutcomePicker value={editOutcome} onChange={setEditOutcome} />
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={3}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(call.id)}
                    disabled={saving}
                    className="flex h-6 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex h-6 items-center gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── Read view ── */
              <div className="flex items-start gap-3">
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg border flex-shrink-0',
                  cfg.solid,
                )}>
                  {cfg.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-medium',
                      cfg.solid,
                    )}>
                      {cfg.label}
                    </span>
                    {call.duration_sec !== null && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(call.duration_sec)}
                      </span>
                    )}
                  </div>
                  {call.notes && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <StickyNote className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">{call.notes}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                    {call.logger_name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {call.logger_name}
                      </span>
                    )}
                    <span>{formatDate(call.called_at)}</span>
                  </div>
                </div>

                {/* Edit + Delete buttons */}
                <div className="flex items-center gap-0.5 shrink-0 ml-1">
                  <button
                    type="button"
                    title="Edit call"
                    onClick={() => startEdit(call)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    title="Delete call"
                    onClick={() => handleDelete(call.id)}
                    disabled={deletingId === call.id}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
