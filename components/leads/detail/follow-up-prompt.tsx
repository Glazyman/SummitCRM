'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { CalendarPicker, TimePicker, joinDateTime } from '@/components/ui/calendar-picker'
import { useTakenSlots, localDateStr } from '@/hooks'

function tomorrowDateStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return localDateStr(d)
}

interface Props {
  leadId:      string
  /** Suggested task title/notes (from the call outcome). */
  title:       string
  notes:       string | null
  /** Who the task is for — used to grey out their already-booked slots. */
  assigneeId?: string | null
  /** Prompt text shown in the amber bar. */
  message?:    string
  /**
   * Called after a task is created. Receives the created follow-up row (or
   * null) so the parent can optimistically insert it; parents that just need
   * to clear the prompt can ignore the argument.
   */
  onScheduled: (created: Record<string, unknown> | null) => void
  onDismiss:   () => void
}

/**
 * The amber "schedule a follow-up" prompt shown after a no-answer / voicemail
 * call. Primary action adds an UNTIMED task (tomorrow, no time slot — stored at
 * 00:00). "Set time" reveals a date + time picker; the time dropdown greys out
 * slots already booked for the assignee so they don't double-book themselves.
 */
export function FollowUpPrompt({ leadId, title, notes, assigneeId, message, onScheduled, onDismiss }: Props) {
  const [mode,   setMode]   = React.useState<'idle' | 'picking'>('idle')
  const [date,   setDate]   = React.useState(tomorrowDateStr)
  const [time,   setTime]   = React.useState('09:00')
  const [saving, setSaving] = React.useState(false)
  const takenSlots = useTakenSlots(assigneeId ?? null, date)

  async function create(dueAtIso: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/follow-ups`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title,
          notes: notes ?? undefined,
          due_at: dueAtIso,
          assigned_to: assigneeId ?? undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) onScheduled(json.follow_up ?? null)
    } finally {
      setSaving(false)
    }
  }

  // Untimed = tomorrow at local midnight (the "no time slot" sentinel).
  const addUntimed = () => create(new Date(joinDateTime(tomorrowDateStr(), '00:00')).toISOString())
  const saveTimed  = () => create(new Date(joinDateTime(date, time)).toISOString())

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{message ?? 'No answer / voicemail logged. Add a follow-up task?'}</span>
        {mode === 'idle' ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={addUntimed} disabled={saving}>Add to tasks</Button>
            <Button size="sm" variant="outline" onClick={() => setMode('picking')} disabled={saving}>Set time</Button>
            <Button size="sm" variant="ghost" onClick={onDismiss} disabled={saving}>Dismiss</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setMode('idle')} disabled={saving}>Back</Button>
        )}
      </div>

      {mode === 'picking' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CalendarPicker value={date} onChange={setDate} />
          <TimePicker value={time} onChange={setTime} disabledSlots={takenSlots} />
          <Button size="sm" onClick={saveTimed} disabled={saving}>Save time</Button>
        </div>
      )}
    </div>
  )
}
