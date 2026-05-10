'use client'

import * as React from 'react'
import Link from 'next/link'
import { PhoneCall, RefreshCw } from 'lucide-react'

type CallRow = {
  id: string
  outcome: string
  duration_sec: number | null
  notes: string | null
  called_at: string
  lead: { id: string; name: string; company: string | null; email: string } | null
}

const OUTCOME_LABEL: Record<string, string> = {
  answered: 'Answered',
  voicemail: 'Voicemail',
  no_answer: 'No Answer',
  wrong_number: 'Wrong Number',
  callback_requested: 'Callback Requested',
}

export function CallsTodayCard() {
  const [calls, setCalls] = React.useState<CallRow[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch('/api/rep/calls-today')
      const json = await res.json()
      if (res.ok) setCalls((json.calls ?? []) as CallRow[])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Calls Made Today</h2>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {loading ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">Loading calls…</div>
        ) : calls.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">No calls logged yet today.</div>
        ) : (
          <div className="divide-y divide-border">
            {calls.map((call) => (
              <div key={call.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {call.lead ? (
                      <Link href={`/leads/${call.lead.id}`} className="text-sm font-medium hover:underline truncate block">
                        {call.lead.name}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">Lead</p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {call.lead?.company ?? call.lead?.email ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {OUTCOME_LABEL[call.outcome] ?? call.outcome}
                      {' · '}
                      {new Date(call.called_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
