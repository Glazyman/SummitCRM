'use client'

import * as React from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, PhoneCall } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectMenu } from '@/components/ui/select-menu'

export interface CallSessionRow {
  id:           string
  user_id:      string
  queue_preset: string | null
  batch_id:     string | null
  queue_size:   number
  calls_logged: number
  skipped:      number
  outcomes:     Record<string, number> | null
  started_at:   string
  ended_at:     string | null
}

interface Props {
  sessions:   CallSessionRow[]
  names:      Record<string, string>
  batchNames: Record<string, string>
  canSeeAll:  boolean
}

const PRESET_LABELS: Record<string, string> = {
  fresh: 'Fresh',
  retry: 'Retries',
  all:   'Everything',
}

const OUTCOME_LABELS: Record<string, string> = {
  answered:           'answered',
  voicemail:          'voicemail',
  no_answer:          'no answer',
  callback_requested: 'callback',
  wrong_number:       'wrong number',
}

function duration(start: string, end: string | null): string {
  if (!end) return '—'
  const mins = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return `${h}h ${mins % 60}m`
}

function outcomeText(o: Record<string, number> | null): string {
  if (!o) return '—'
  const parts = Object.entries(o)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${OUTCOME_LABELS[k] ?? k.replace(/_/g, ' ')}`)
  return parts.length ? parts.join(' · ') : '—'
}

export function SessionsClient({ sessions, names, batchNames, canSeeAll }: Props) {
  const [repFilter, setRepFilter] = React.useState('')

  // Rep options for the admin filter, derived from the loaded sessions.
  const repOptions = React.useMemo(() => {
    const ids = [...new Set(sessions.map((s) => s.user_id))]
    return ids
      .map((id) => ({ value: id, label: names[id] ?? 'Unknown' }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [sessions, names])

  const visible = repFilter ? sessions.filter((s) => s.user_id === repFilter) : sessions

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <PhoneCall className="h-5 w-5 text-primary" />
            Call sessions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canSeeAll ? 'Every Call Mode session in the workspace.' : 'Your past Call Mode sessions.'}
          </p>
        </div>
        <Link
          href="/call-mode"
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Call Mode
        </Link>
      </div>

      {canSeeAll && repOptions.length > 1 && (
        <div className="mb-4 max-w-xs">
          <SelectMenu
            value={repFilter}
            onChange={(v: string) => setRepFilter(v)}
            nullable
            nullLabel="All reps"
            size="sm"
            searchable={repOptions.length > 6}
            options={repOptions}
          />
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-xs shadow-black/5">
          No call sessions yet.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs shadow-black/5 lg:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">When</th>
                  {canSeeAll && <th className="px-4 py-2.5">Rep</th>}
                  <th className="px-4 py-2.5">Queue</th>
                  <th className="px-4 py-2.5 text-right">Logged</th>
                  <th className="px-4 py-2.5 text-right">Skipped</th>
                  <th className="px-4 py-2.5">Outcomes</th>
                  <th className="px-4 py-2.5 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5">{format(new Date(s.started_at), 'MMM d, h:mm a')}</td>
                    {canSeeAll && <td className="px-4 py-2.5">{names[s.user_id] ?? 'Unknown'}</td>}
                    <td className="px-4 py-2.5">
                      {PRESET_LABELS[s.queue_preset ?? ''] ?? '—'}
                      {s.batch_id && batchNames[s.batch_id] && (
                        <span className="text-muted-foreground"> · {batchNames[s.batch_id]}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">{s.queue_size} in queue</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{s.calls_logged}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{s.skipped}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{outcomeText(s.outcomes)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {s.ended_at ? duration(s.started_at, s.ended_at) : <span className="text-amber-600">in progress</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 lg:hidden">
            {visible.map((s) => (
              <div key={s.id} className="rounded-xl border bg-card p-4 shadow-xs shadow-black/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{format(new Date(s.started_at), 'MMM d, h:mm a')}</span>
                  <span className={cn('text-xs tabular-nums', s.ended_at ? 'text-muted-foreground' : 'text-amber-600')}>
                    {s.ended_at ? duration(s.started_at, s.ended_at) : 'in progress'}
                  </span>
                </div>
                {canSeeAll && <p className="mt-0.5 text-xs text-muted-foreground">{names[s.user_id] ?? 'Unknown'}</p>}
                <p className="mt-1 text-sm">
                  {PRESET_LABELS[s.queue_preset ?? ''] ?? '—'}
                  {s.batch_id && batchNames[s.batch_id] && (
                    <span className="text-muted-foreground"> · {batchNames[s.batch_id]}</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{s.calls_logged}</span> logged · {s.skipped} skipped · {s.queue_size} in queue
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{outcomeText(s.outcomes)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
