'use client'

import * as React from 'react'
import { Sparkles, ChevronDown, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectMenu } from '@/components/ui/select-menu'
import { DayNav, dayLabel, dayRange, todayYmd } from '@/components/ui/day-nav'

interface InterestedLead {
  id:              string
  name:            string
  company:         string | null
  phone:           string | null
  stillInterested: boolean
  markedAt:        string
  markedBy:        string | null
}

/**
 * Admin-only card on /leads: leads MARKED interested on a chosen day (default
 * today), with who marked them and when. Click a row to open the lead panel.
 */
export function InterestedDayCard({
  teamMembers, onOpenLead,
}: {
  teamMembers: { id: string; name: string }[]
  onOpenLead:  (leadId: string) => void
}) {
  const [day,     setDay]     = React.useState(todayYmd)
  const [rep,     setRep]     = React.useState('')
  const [open,    setOpen]    = React.useState(true)
  const [leads,   setLeads]   = React.useState<InterestedLead[] | null>(null)
  const [failed,  setFailed]  = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    const { start, end } = dayRange(day)
    const qs = new URLSearchParams({ start, end, ...(rep ? { rep } : {}) })
    fetch(`/api/leads/interested?${qs}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d: { leads: InterestedLead[] }) => { if (!cancelled) { setLeads(d.leads); setFailed(false) } })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [day, rep])

  const count = leads?.length ?? 0

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/15">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="text-sm font-semibold">
            Marked interested · {dayLabel(day)}
          </span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white tabular-nums">
            {leads === null ? '…' : count}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
        </button>
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {teamMembers.length > 1 && (
            <SelectMenu
              value={rep}
              onChange={(v) => { setLeads(null); setRep(v) }}
              nullable
              nullLabel="All reps"
              size="sm"
              searchable={teamMembers.length > 5}
              options={teamMembers.map((m) => ({ value: m.id, label: m.name }))}
              className="w-36"
            />
          )}
          <DayNav value={day} onChange={(v) => { setLeads(null); setDay(v) }} />
        </div>
      </div>

      {open && (
        <div className="border-t border-emerald-200/70 dark:border-emerald-900/50">
          {failed ? (
            <p className="px-4 py-4 text-sm text-red-600">Couldn&apos;t load interested leads.</p>
          ) : leads === null ? (
            <div className="space-y-2 px-4 py-3">
              {[0, 1].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/60" />)}
            </div>
          ) : count === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">No leads were marked interested {dayLabel(day) === 'Today' ? 'today' : 'that day'}.</p>
          ) : (
            <ul className="divide-y divide-emerald-200/60 dark:divide-emerald-900/40">
              {leads.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => onOpenLead(l.id)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-left transition-colors hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {l.name}
                        {!l.stillInterested && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            changed since
                          </span>
                        )}
                      </span>
                      {l.company && <span className="block truncate text-xs text-muted-foreground">{l.company}</span>}
                    </span>
                    {l.phone && <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{l.phone}</span>}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />{l.markedBy ?? '—'}
                    </span>
                    <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                      {new Date(l.markedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
