'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronRight, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNowStrict, isPast, isToday } from 'date-fns'

interface FollowUp {
  id:         string
  lead_id:    string
  due_at:     string
  notes:      string | null
  lead_name:  string
  company:    string | null
}

// Mock data for frontend development
const MOCK_FOLLOWUPS: FollowUp[] = [
  {
    id: 'f1', lead_id: 'l1',
    due_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    notes: 'Send pricing deck',
    lead_name: 'Sarah Chen', company: 'Stripe',
  },
  {
    id: 'f2', lead_id: 'l2',
    due_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
    notes: 'Follow up on trial',
    lead_name: 'Marcus Rodriguez', company: 'Notion',
  },
  {
    id: 'f3', lead_id: 'l3',
    due_at: new Date(Date.now() + 1800_000).toISOString(),
    notes: 'Intro call scheduled',
    lead_name: 'Emma Wilson', company: 'Linear',
  },
  {
    id: 'f4', lead_id: 'l4',
    due_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
    notes: null,
    lead_name: 'Jake Thompson', company: 'Figma',
  },
]

function getDueLabel(due_at: string): { label: string; urgent: boolean; overdue: boolean } {
  const date = new Date(due_at)
  const overdue = isPast(date) && !isToday(date)
  const urgent  = isPast(date)

  if (overdue) {
    return { label: `${formatDistanceToNowStrict(date)} overdue`, urgent: true, overdue: true }
  }
  if (isPast(date)) {
    return { label: 'Due now', urgent: true, overdue: false }
  }
  return { label: `Due in ${formatDistanceToNowStrict(date)}`, urgent: false, overdue: false }
}

interface Props {
  className?: string
  limit?: number
}

export function OverdueFollowUpsWidget({ className, limit = 5 }: Props) {
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    // Replace with real API call:
    // fetch('/api/follow-ups?overdue=1&limit=' + limit).then(...)
    setTimeout(() => {
      setFollowUps(MOCK_FOLLOWUPS.slice(0, limit))
      setLoading(false)
    }, 400)
  }, [limit])

  const overdueCount = followUps.filter(f => getDueLabel(f.due_at).overdue).length

  return (
    <div className={cn('rounded-xl border bg-card', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Follow-ups</span>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-[10px] font-semibold">
              <AlertCircle className="w-3 h-3" />
              {overdueCount} overdue
            </span>
          )}
        </div>
        <Link
          href="/leads"
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
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
            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <CalendarClock className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-sm text-muted-foreground">No follow-ups due</p>
          </div>
        ) : (
          <ul>
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
                    {/* Urgency indicator */}
                    <div className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0 mt-0.5',
                      due.overdue  ? 'bg-red-500'    :
                      due.urgent   ? 'bg-orange-400' : 'bg-emerald-400'
                    )} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium truncate">{f.lead_name}</span>
                        <span className={cn(
                          'text-[11px] flex-shrink-0',
                          due.overdue  ? 'text-red-500 font-semibold' :
                          due.urgent   ? 'text-orange-500 font-medium' : 'text-muted-foreground'
                        )}>
                          {due.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {f.company && (
                          <span className="text-xs text-muted-foreground truncate">{f.company}</span>
                        )}
                        {f.notes && (
                          <>
                            {f.company && <span className="text-muted-foreground/40 text-xs">·</span>}
                            <span className="text-xs text-muted-foreground truncate italic">{f.notes}</span>
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
