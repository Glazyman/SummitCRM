'use client'

import * as React from 'react'
import { Phone, PhoneOff, PhoneMissed, VoicemailIcon, Clock, User, StickyNote } from 'lucide-react'
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
  calls: CallLogItem[]
}

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
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ── Main component ────────────────────────────────────────────────────────
export function CallHistory({ calls }: CallHistoryProps) {
  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
        <Phone className="h-8 w-8 opacity-30" />
        <p className="text-sm">No calls logged yet</p>
        <p className="text-xs text-muted-foreground/60">Calls are logged automatically when you update a lead's status</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {calls.map((call) => {
        const cfg = OUTCOME_CONFIG[call.outcome]
        return (
          <div
            key={call.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg border flex-shrink-0',
              cfg.solid
            )}>
              {cfg.icon}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-medium',
                  cfg.solid
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
  )
}
