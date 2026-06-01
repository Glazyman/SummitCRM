'use client'

import { useState, useEffect } from 'react'

const p2 = (n: number) => String(n).padStart(2, '0')

/** Local "YYYY-MM-DD" for a Date. */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/**
 * Returns the set of "HH:MM" slots already booked by `assigneeId` on the local
 * date `dateStr` ("YYYY-MM-DD"), so the time picker can grey them out and the
 * rep doesn't double-book themselves. Untimed tasks (stored at 00:00 — the
 * "no time" sentinel) are ignored: they don't occupy a slot.
 *
 * Reads non-completed tasks from GET /api/tasks (which scopes a `rep` to their
 * own tasks automatically, and accepts `assigned_to` for admins/managers).
 */
export function useTakenSlots(assigneeId: string | null, dateStr: string | null): Set<string> {
  const [taken, setTaken] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!assigneeId || !dateStr) { setTaken(new Set()); return }
    let cancelled = false

    const params = new URLSearchParams({ done: 'false', assigned_to: assigneeId })
    fetch(`/api/tasks?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return
        const acts = (j.data?.activities ?? []) as Array<{ due_at: string }>
        const set = new Set<string>()
        for (const a of acts) {
          const d = new Date(a.due_at)
          if (localDateStr(d) !== dateStr) continue
          const hh = p2(d.getHours())
          const mm = p2(d.getMinutes())
          if (hh === '00' && mm === '00') continue // untimed → no slot
          set.add(`${hh}:${mm}`)
        }
        setTaken(set)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [assigneeId, dateStr])

  return taken
}
