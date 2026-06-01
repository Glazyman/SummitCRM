'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronRight, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FollowUp {
  id:        string
  lead_id:   string
  due_at:    string
  title:     string
  notes:     string | null
  lead_name: string
  company:   string | null
}

function getDueLabel(due_at: string): { label: string; urgent: boolean; overdue: boolean } {
  const d       = new Date(due_at)
  const now     = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueMidnight   = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / 86400000)

  const untimed = d.getHours() === 0 && d.getMinutes() === 0 // 00:00 = no time slot
  if (diffDays < 0) {
    const days = Math.abs(diffDays)
    return { label: `${days}d overdue`, urgent: true, overdue: true }
  }
  if (diffDays === 0) {
    if (untimed) return { label: 'Due today', urgent: false, overdue: false }
    if (d < now) return { label: 'Due now', urgent: true, overdue: false } // time already passed
    return {
      label: `Due today · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
      urgent: false,
      overdue: false,
    }
  }
  return { label: 'Due tomorrow', urgent: false, overdue: false }
}

interface Props {
  className?: string
}

export function OverdueFollowUpsWidget({ className }: Props) {
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        // Query follow-ups directly — filter to due today or overdue
        const res  = await fetch('/api/tasks?done=false')
        if (!res.ok || cancelled) return

        const json = await res.json() as {
          data?: { activities?: Array<{
            id: string
            title: string
            notes: string | null
            due_at: string
            lead: { id: string; first_name: string | null; last_name: string | null; email: string; company: string | null } | null
          }> }
        }

        const activities = json.data?.activities ?? []

        // End of today
        const endOfToday = new Date()
        endOfToday.setHours(23, 59, 59, 999)

        // Show ALL of the day's tasks (overdue + due today), not just a few.
        const due = activities
          .filter(a => a.lead && new Date(a.due_at) <= endOfToday)
          .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
          .map(a => ({
            id:        a.id,
            lead_id:   a.lead!.id,
            due_at:    a.due_at,
            title:     a.title,
            notes:     a.notes,
            lead_name: [a.lead!.first_name, a.lead!.last_name].filter(Boolean).join(' ') || a.lead!.email,
            company:   a.lead!.company,
          }))

        if (!cancelled) setFollowUps(due)
      } catch {
        if (!cancelled) setFollowUps([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  const overdueCount = followUps.filter(f => getDueLabel(f.due_at).overdue).length

  return (
    <div className={cn('rounded-xl border bg-card', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Tasks</span>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive text-[10px] font-semibold">
              <AlertCircle className="w-3 h-3" />
              {overdueCount} overdue
            </span>
          )}
        </div>
        <Link
          href="/tasks"
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          All tasks <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Body */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : followUps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
              <CalendarClock className="w-5 h-5 text-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No tasks due today</p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {followUps.map((f, i) => {
              const due = getDueLabel(f.due_at)
              return (
                <li key={f.id}>
                  <Link
                    href={`/leads/${f.lead_id}`}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors',
                      i < followUps.length - 1 && 'border-b'
                    )}
                  >
                    <div className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0 mt-0.5',
                      due.overdue ? 'bg-destructive' : due.urgent ? 'bg-amber-500' : 'bg-emerald-500'
                    )} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium truncate">{f.lead_name}</span>
                        <span className={cn(
                          'text-[11px] flex-shrink-0 whitespace-nowrap',
                          due.overdue ? 'text-destructive font-semibold' :
                          due.urgent  ? 'text-amber-600 font-medium' : 'text-muted-foreground'
                        )}>
                          {due.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground truncate">{f.title}</span>
                        {f.company && (
                          <>
                            <span className="text-muted-foreground/40 text-xs">·</span>
                            <span className="text-xs text-muted-foreground truncate">{f.company}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
