'use client'

import * as React from 'react'
import { Phone, PhoneOff, PhoneMissed, VoicemailIcon, Plus, Clock, User, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
  calls:          CallLogItem[]
  onLogCall:      (data: NewCall) => Promise<void>
  currentUserId:  string
}

export interface NewCall {
  outcome:      CallOutcome
  duration_sec: number | null
  notes:        string | null
}

const OUTCOME_CONFIG: Record<CallOutcome, { label: string; icon: React.ReactNode; badge: string }> = {
  answered: {
    label: 'Answered',
    icon:  <Phone className="h-3.5 w-3.5" />,
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  voicemail: {
    label: 'Voicemail',
    icon:  <VoicemailIcon className="h-3.5 w-3.5" />,
    badge: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400',
  },
  no_answer: {
    label: 'No Answer',
    icon:  <PhoneMissed className="h-3.5 w-3.5" />,
    badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
  },
  wrong_number: {
    label: 'Wrong Number',
    icon:  <PhoneOff className="h-3.5 w-3.5" />,
    badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
  },
  callback_requested: {
    label: 'Callback Requested',
    icon:  <Phone className="h-3.5 w-3.5" />,
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
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
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ── Log call form ─────────────────────────────────────────────────────────
function LogCallForm({ onSubmit, onCancel }: {
  onSubmit:  (data: NewCall) => Promise<void>
  onCancel:  () => void
}) {
  const [outcome, setOutcome]       = React.useState<CallOutcome>('answered')
  const [minutes, setMinutes]       = React.useState('')
  const [seconds, setSeconds]       = React.useState('')
  const [notes, setNotes]           = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const mins = parseInt(minutes || '0', 10)
    const secs = parseInt(seconds || '0', 10)
    const duration = (mins * 60 + secs) || null
    try {
      await onSubmit({ outcome, duration_sec: duration, notes: notes.trim() || null })
      onCancel()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <h3 className="text-sm font-semibold">Log a Call</h3>

      {/* Outcome selector */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Outcome</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((o) => {
            const cfg = OUTCOME_CONFIG[o]
            return (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome(o)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all',
                  outcome === o
                    ? `${cfg.badge} ring-2 ring-offset-1 ring-ring`
                    : 'border-border text-muted-foreground hover:border-primary/50'
                )}
              >
                {cfg.icon}
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Duration */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Duration (optional)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="999"
            placeholder="0"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-16 h-8 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">min</span>
          <input
            type="number"
            min="0"
            max="59"
            placeholder="0"
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            className="w-16 h-8 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">sec</span>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block">Notes (optional)</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Brief call summary…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Logging…' : 'Log Call'}
        </Button>
      </div>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export function CallHistory({ calls, onLogCall }: CallHistoryProps) {
  const [showForm, setShowForm] = React.useState(false)

  return (
    <div className="space-y-4">
      {/* Log call button */}
      {!showForm && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(true)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Log a Call
        </Button>
      )}

      {showForm && (
        <LogCallForm
          onSubmit={onLogCall}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Call list */}
      {calls.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
          <Phone className="h-8 w-8 opacity-30" />
          <p className="text-sm">No calls logged yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {calls.map((call) => {
            const cfg = OUTCOME_CONFIG[call.outcome]
            return (
              <div
                key={call.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
              >
                {/* Icon */}
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border flex-shrink-0',
                  cfg.badge
                )}>
                  {cfg.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium',
                      cfg.badge
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
