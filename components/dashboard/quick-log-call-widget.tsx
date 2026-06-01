'use client'

import * as React from 'react'
import { PhoneCall, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FollowUpPrompt } from '@/components/leads/detail/follow-up-prompt'
import type { CallOutcome } from '@/types/database'

type LeadHit = {
  id: string
  name: string
  email: string
  phone: string | null
  company: string | null
}

type FollowUpSuggestion = {
  title: string
  notes: string | null
  due_at: string
}

function tomorrowAt11LocalIso() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(11, 0, 0, 0)
  return d.toISOString()
}

const OUTCOMES: Array<{ id: CallOutcome; label: string }> = [
  { id: 'answered', label: 'Answered' },
  { id: 'voicemail', label: 'Voicemail' },
  { id: 'no_answer', label: 'No Answer' },
  { id: 'wrong_number', label: 'Wrong Number' },
  { id: 'callback_requested', label: 'Callback Requested' },
]

export function QuickLogCallWidget() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<LeadHit[]>([])
  const [selectedLead, setSelectedLead] = React.useState<LeadHit | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [outcome, setOutcome] = React.useState<CallOutcome>('answered')
  const [minutes, setMinutes] = React.useState('')
  const [seconds, setSeconds] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [followUpSuggestion, setFollowUpSuggestion] = React.useState<FollowUpSuggestion | null>(null)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  function resetForm() {
    setQuery('')
    setResults([])
    setSelectedLead(null)
    setOutcome('answered')
    setMinutes('')
    setSeconds('')
    setNotes('')
    setFollowUpSuggestion(null)
    setError(null)
    setSuccess(null)
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetForm()
  }

  function handleSearchInput(next: string) {
    setQuery(next)
    setError(null)

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (next.trim().length < 2) {
      setResults([])
      setSelectedLead(null)
      setSearching(false)
      return
    }

    timeoutRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/leads/search?q=${encodeURIComponent(next.trim())}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Search failed')
        setResults((json.leads ?? []) as LeadHit[])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        setSearching(false)
      }
    }, 250)
  }

  async function submit() {
    if (!selectedLead) {
      setError('Select a lead first.')
      return
    }

    const mins = Number.parseInt(minutes || '0', 10)
    const secs = Number.parseInt(seconds || '0', 10)
    const duration = mins > 0 || secs > 0 ? Math.max(0, mins * 60 + secs) : null

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/leads/${selectedLead.id}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          duration_sec: duration,
          notes: notes.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to log call')

      setSuccess('Call logged.')
      if (json.follow_up_suggestion) {
        setFollowUpSuggestion({
          ...(json.follow_up_suggestion as FollowUpSuggestion),
          due_at: tomorrowAt11LocalIso(),
        })
      } else {
        setFollowUpSuggestion(null)
      }
      if (!json.follow_up_suggestion) {
        setTimeout(() => {
          window.location.reload()
        }, 500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log call')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
      >
        <PhoneCall className="h-4 w-4" />
        Log a Call
      </button>

      <Dialog open={open} onClose={() => onOpenChange(false)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Log a Call</DialogTitle>
            <DialogDescription>Find a lead and log the call outcome without leaving the dashboard.</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
            {success && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}
            {followUpSuggestion && selectedLead && (
              <FollowUpPrompt
                leadId={selectedLead.id}
                title={followUpSuggestion.title}
                notes={followUpSuggestion.notes}
                assigneeId={null}
                message="Suggested follow-up. Add it as a task?"
                onScheduled={() => {
                  setSuccess('Call logged and follow-up added to tasks.')
                  setFollowUpSuggestion(null)
                  setTimeout(() => window.location.reload(), 500)
                }}
                onDismiss={() => setFollowUpSuggestion(null)}
              />
            )}

            <div className="space-y-2">
              <Label htmlFor="lead-search">Find lead</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="lead-search"
                  value={query}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder="Name, email, or company"
                  className="pl-9"
                />
              </div>
              {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
              {results.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                  {results.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => setSelectedLead(lead)}
                      className={`w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/40 ${selectedLead?.id === lead.id ? 'bg-primary/10' : ''}`}
                    >
                      <p className="text-sm font-medium">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.company ?? 'No company'} · {lead.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Outcome</Label>
              <div className="flex flex-wrap gap-2">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setOutcome(o.id)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium ${outcome === o.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="minutes">Minutes</Label>
                <Input id="minutes" type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seconds">Seconds</Label>
                <Input id="seconds" type="number" min={0} max={59} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || !selectedLead}>{submitting ? 'Logging…' : 'Log Call'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
