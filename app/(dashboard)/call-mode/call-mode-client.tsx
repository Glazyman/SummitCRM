'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PhoneCall, Phone, Globe, MapPin, Layers, SkipForward,
  Voicemail, PhoneMissed, PhoneOff, CalendarClock, CheckCircle2, X, PanelRightOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SelectMenu } from '@/components/ui/select-menu'
import { FollowUpPrompt } from '@/components/leads/detail/follow-up-prompt'
import { LeadFullPanel } from '@/components/leads/lead-full-panel'
import type { TeamMember } from '@/components/leads/detail/types'
import type { CallOutcome } from '@/types/database'

// NOTE: no "callbacks" preset — `callback` is not a lead status in this app
// (callbacks live in the tasks system as follow_ups.type='callback'); the
// Callback outcome below creates a follow-up suggestion instead.
export type QueuePreset = 'fresh' | 'retry' | 'all'

export interface QueueLead {
  id:                string
  first_name:        string | null
  last_name:         string | null
  email:             string | null
  website:           string | null
  phone:             string
  company:           string | null
  title:             string | null
  status:            string
  batch_name:        string | null
  last_contacted_at: string | null
  last_call_outcome: string | null
  state:             string | null
}

interface Props {
  leads:          QueueLead[]
  batches:        { id: string; name: string }[]
  queue:          QueuePreset
  batchId:        string | null
  skippedNoPhone: number
  currentUserId?: string
  /** Whether the caller is an admin — gates batch edits etc. in the full panel. */
  isAdmin?:       boolean
  /** Workspace members for the full lead panel's assignment dropdowns. */
  teamMembers?:   TeamMember[]
  loadError?:     boolean
  /** Unique leads this user already called today (server-computed at load). */
  calledToday?:   number
  /** Admin-set daily call target (per-rep override or workspace default). */
  dailyTarget?:   number
  /** Total leads matching the filters — the queue itself is capped per session. */
  totalMatching?: number
}

const QUEUE_LABELS: Record<QueuePreset, { title: string; desc: string }> = {
  fresh: { title: 'Fresh leads', desc: 'Never called (status: new)' },
  retry: { title: 'Retries',     desc: 'Voicemail or no answer last time' },
  all:   { title: 'Everything',  desc: 'Fresh + retries' },
}

interface OutcomeDef {
  outcome: CallOutcome
  label:   string
  kbd:     string
  icon:    React.ComponentType<{ className?: string }>
  classes: string
}

const OUTCOMES: OutcomeDef[] = [
  { outcome: 'answered',           label: 'Answered',     kbd: '1', icon: CheckCircle2,  classes: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  { outcome: 'voicemail',          label: 'Voicemail',    kbd: '2', icon: Voicemail,     classes: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { outcome: 'no_answer',          label: 'No answer',    kbd: '3', icon: PhoneMissed,   classes: 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100' },
  { outcome: 'callback_requested', label: 'Callback',     kbd: '4', icon: CalendarClock, classes: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100' },
  { outcome: 'wrong_number',       label: 'Wrong number', kbd: '5', icon: PhoneOff,      classes: 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100' },
]

function fmtAgo(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1mo ago' : `${months}mo ago`
}

function leadName(l: QueueLead): string {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Unnamed lead'
}

// Ensure the website opens as an absolute URL; show it bare (no protocol/slash).
function siteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
function siteLabel(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

// Derived from OUTCOMES so a renamed outcome can't drift; callback uses the
// longer wording in history lines.
const OUTCOME_LABELS: Record<string, string> = {
  ...Object.fromEntries(OUTCOMES.map((o) => [o.outcome, o.label])),
  callback_requested: 'Callback requested',
}

type Phase = 'setup' | 'live' | 'done'

export function CallModeClient({
  leads, batches, queue, batchId, skippedNoPhone, currentUserId, loadError,
  isAdmin = false, teamMembers = [],
  calledToday = 0, dailyTarget = 0, totalMatching = 0,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()

  // Today's unique-leads-called count. Incremented locally only for leads not
  // already contacted today (matches the server's count-DISTINCT-lead
  // semantics — a retry-queue lead called earlier today must not re-count);
  // re-seeded from the server on refresh.
  const [todayCalled, setTodayCalled] = React.useState(calledToday)
  React.useEffect(() => { setTodayCalled(calledToday) }, [calledToday])

  const [phase,   setPhase]   = React.useState<Phase>('setup')
  const [index,   setIndex]   = React.useState(0)
  const [notes,   setNotes]   = React.useState('')
  // Mirror of `notes` so logOutcome doesn't depend on it — keeps the callback
  // (and the window keydown listener that depends on it) stable across keystrokes.
  const notesRef = React.useRef('')
  const [posting, setPosting] = React.useState(false)
  const [error,   setError]   = React.useState<string | null>(null)
  const [tally,   setTally]   = React.useState<Record<string, number>>({})
  const [skipped, setSkipped] = React.useState(0)
  const [followUp, setFollowUp] = React.useState<{ leadId: string; title: string; notes: string | null } | null>(null)
  // Optional full lead panel for the current lead (read everything / edit notes,
  // tags, intake mid-call). Opening it suspends the 1–5/S keyboard shortcuts.
  const [panelOpen, setPanelOpen] = React.useState(false)
  // Logged Call Mode session: created on "Start calling", finalized (tallies +
  // ended_at) when the session reaches the summary. Refs so the fire-and-forget
  // writes don't re-trigger renders or the keyboard effect.
  const sessionIdRef = React.useRef<string | null>(null)
  const finalizedRef = React.useRef(false)

  const lead = leads[index] as QueueLead | undefined
  const called = Object.values(tally).reduce((a, b) => a + b, 0)

  function setFilters(next: { queue?: QueuePreset; batch?: string | null }) {
    const q = next.queue ?? queue
    const b = next.batch === undefined ? batchId : next.batch
    const params = new URLSearchParams()
    params.set('queue', q)
    if (b) params.set('batch', b)
    startTransition(() => router.replace(`/call-mode?${params.toString()}`))
  }

  // Begin a session: reset tallies, create the logged call_sessions row
  // (fire-and-forget — a failed log just means no rollup), enter the live phase.
  function startSession() {
    setIndex(0); setTally({}); setSkipped(0); setNotes(''); notesRef.current = ''
    sessionIdRef.current = null
    finalizedRef.current = false
    setPhase('live')
    fetch('/api/call-sessions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ queue_preset: queue, batch_id: batchId, queue_size: leads.length }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.id) sessionIdRef.current = j.id })
      .catch(() => {})
  }

  function advance() {
    setNotes('')
    notesRef.current = ''
    setError(null)
    setFollowUp(null)
    setPanelOpen(false)
    if (index + 1 >= leads.length) setPhase('done')
    else setIndex(index + 1)
  }

  const logOutcome = React.useCallback(async (outcome: CallOutcome) => {
    if (!lead || posting || followUp) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/calls`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ outcome, notes: notesRef.current.trim() || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Failed to log the call — try again.')
        return
      }
      setTally((t) => ({ ...t, [outcome]: (t[outcome] ?? 0) + 1 }))
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const alreadyCountedToday =
        !!lead.last_contacted_at && new Date(lead.last_contacted_at) >= startOfToday
      if (!alreadyCountedToday) setTodayCalled((c) => c + 1)
      const suggestion = json.follow_up_suggestion as { title: string; notes: string | null } | null
      if (suggestion) {
        // Pause on this lead so the rep can one-tap a follow-up task; the
        // prompt's actions (schedule or dismiss) advance the queue.
        setFollowUp({ leadId: lead.id, title: suggestion.title, notes: suggestion.notes })
      } else {
        advance()
      }
    } catch {
      setError('Network error — check the lead’s call history before retrying (the call may have been saved).')
    } finally {
      setPosting(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, posting, followUp, index, leads.length])

  const skip = React.useCallback(() => {
    if (posting || followUp) return
    setSkipped((s) => s + 1)
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posting, followUp, index, leads.length])

  // Keyboard shortcuts: 1–5 = outcomes, S = skip. Ignored while typing or while
  // the full lead panel is open (its own inputs/buttons own the keyboard then).
  React.useEffect(() => {
    if (phase !== 'live' || panelOpen) return
    function onKey(e: KeyboardEvent) {
      // Held-down keys auto-repeat ~30x/sec — without this guard a held "1"
      // would log calls against leads as the queue advances under it.
      if (e.repeat) return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const def = OUTCOMES.find((o) => o.kbd === e.key)
      if (def) { e.preventDefault(); void logOutcome(def.outcome) }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); skip() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, panelOpen, logOutcome, skip])

  // Finalize the logged session once the summary is reached (queue exhausted or
  // End session). Stamps the final tallies + ended_at exactly once.
  React.useEffect(() => {
    if (phase !== 'done' || !sessionIdRef.current || finalizedRef.current) return
    finalizedRef.current = true
    void fetch(`/api/call-sessions/${sessionIdRef.current}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ calls_logged: called, skipped, outcomes: tally, ended: true }),
    }).catch(() => {})
  }, [phase, called, skipped, tally])

  // ── Setup ────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <PhoneCall className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Call Mode</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Work a queue one lead at a time. Log the outcome, get the next one. No mouse needed.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-xs shadow-black/5">
          {dailyTarget > 0 && (
            <div className="mb-4 border-b pb-4">
              <TargetProgress called={todayCalled} target={dailyTarget} />
            </div>
          )}

          <p className="mb-2 text-sm font-medium">Who are we calling?</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(QUEUE_LABELS) as QueuePreset[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilters({ queue: key })}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                  queue === key
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-input hover:bg-accent',
                )}
              >
                <span className="block text-sm font-medium">{QUEUE_LABELS[key].title}</span>
                <span className="block text-xs text-muted-foreground">{QUEUE_LABELS[key].desc}</span>
              </button>
            ))}
          </div>

          {batches.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Batch</p>
              <SelectMenu
                value={batchId ?? ''}
                onChange={(v: string) => setFilters({ batch: v || null })}
                nullable
                nullLabel="All batches"
                size="sm"
                options={batches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
          )}

          {loadError && (
            <p className="mt-4 text-sm text-destructive">
              The queue failed to load — refresh the page to retry.
            </p>
          )}

          <div className="mt-5 flex items-center justify-between border-t pt-4">
            <div className="text-sm text-muted-foreground">
              {isPending ? (
                'Loading queue…'
              ) : (
                <>
                  <span className="font-semibold text-foreground">{leads.length}</span>
                  {' '}lead{leads.length === 1 ? '' : 's'} in the queue
                  {totalMatching > leads.length && (
                    <span className="block text-xs">
                      of {totalMatching} matching — finish this session and start another for the rest
                    </span>
                  )}
                  {skippedNoPhone > 0 && (
                    <span className="block text-xs">({skippedNoPhone} matching lead{skippedNoPhone === 1 ? '' : 's'} skipped — no phone number)</span>
                  )}
                </>
              )}
            </div>
            <Button
              disabled={isPending || leads.length === 0 || !!loadError}
              onClick={startSession}
            >
              <PhoneCall className="mr-1.5 h-4 w-4" />
              Start calling
            </Button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Shortcuts during a session: <Kbd>1</Kbd>–<Kbd>5</Kbd> log an outcome · <Kbd>S</Kbd> skips
        </p>
        <p className="mt-2 text-center text-xs">
          <Link href="/call-mode/sessions" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            View past sessions
          </Link>
        </p>
      </div>
    )
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  if (phase === 'done' || !lead) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="rounded-xl border bg-card p-6 text-center shadow-xs shadow-black/5">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <h1 className="text-xl font-semibold">Session done</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {called} call{called === 1 ? '' : 's'} logged{skipped > 0 ? ` · ${skipped} skipped` : ''}
          </p>

          {dailyTarget > 0 && (
            <div className="mx-auto mt-4 max-w-xs">
              <TargetProgress called={todayCalled} target={dailyTarget} />
            </div>
          )}

          {called > 0 && (
            <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2 text-left sm:grid-cols-3">
              {OUTCOMES.filter((o) => (tally[o.outcome] ?? 0) > 0).map((o) => (
                <div key={o.outcome} className={cn('rounded-lg border px-3 py-2', o.classes)}>
                  <span className="block text-lg font-semibold">{tally[o.outcome]}</span>
                  <span className="block text-xs">{o.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => router.push('/leads')}>Back to leads</Button>
            <Button onClick={() => startTransition(() => { router.refresh(); setPhase('setup') })}>
              New session
            </Button>
          </div>
          <p className="mt-3 text-xs">
            <Link href="/call-mode/sessions" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              View past sessions
            </Link>
          </p>
        </div>
      </div>
    )
  }

  // ── Live session ─────────────────────────────────────────────────────────
  const progress = leads.length > 0 ? (index / leads.length) * 100 : 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      {/* Progress header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <PhoneCall className="h-4 w-4 text-primary" />
          Call Mode
          <span className="text-muted-foreground">· {index + 1} / {leads.length}</span>
          {dailyTarget > 0 && (
            <span className={cn(
              'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
              todayCalled >= dailyTarget ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground',
            )}>
              Today {todayCalled}/{dailyTarget}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setPhase('done')}>
          <X className="mr-1 h-3.5 w-3.5" /> End session
        </Button>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      {followUp && (
        <div className="mb-4">
          <FollowUpPrompt
            leadId={followUp.leadId}
            title={followUp.title}
            notes={followUp.notes}
            assigneeId={currentUserId ?? null}
            message="Schedule a follow-up before the next lead?"
            onScheduled={() => advance()}
            onDismiss={() => advance()}
          />
        </div>
      )}

      {/* Lead card */}
      <div className="rounded-xl border bg-card p-5 shadow-xs shadow-black/5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              title="Open full lead profile"
              className="max-w-full truncate rounded text-left text-xl font-semibold tracking-tight outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              {leadName(lead)}
            </button>
            <p className="truncate text-sm text-muted-foreground">
              {[lead.title, lead.company].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
              {lead.status.replace(/_/g, ' ')}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPanelOpen(true)}>
              <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" />
              Full profile
            </Button>
          </div>
        </div>

        {/* The phone number — the whole point */}
        <a
          href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`}
          className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 py-3 text-lg font-semibold text-primary transition-colors hover:bg-primary/10 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <Phone className="h-5 w-5" />
          {lead.phone}
        </a>

        {/* Context line */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {lead.last_contacted_at ? (
            <span>
              Last: {OUTCOME_LABELS[lead.last_call_outcome ?? ''] ?? 'contacted'} {fmtAgo(lead.last_contacted_at)}
            </span>
          ) : (
            <span>Never called</span>
          )}
          {lead.state && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.state}</span>}
          {lead.batch_name && <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" />{lead.batch_name}</span>}
          {lead.website && (
            <a
              href={siteHref(lead.website)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Globe className="h-3 w-3" />{siteLabel(lead.website)}
            </a>
          )}
        </div>

        {/* Notes while talking */}
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); notesRef.current = e.target.value }}
          placeholder="Notes while you talk… (saved with the call log)"
          rows={3}
          className={cn(
            'mt-4 w-full resize-none rounded-lg border border-input bg-background p-3 text-sm',
            'placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
          )}
        />

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        {/* Outcome buttons */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {OUTCOMES.map((o) => (
            <button
              key={o.outcome}
              type="button"
              disabled={posting || !!followUp}
              onClick={() => void logOutcome(o.outcome)}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors',
                'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                'disabled:cursor-not-allowed disabled:opacity-50',
                o.classes,
              )}
            >
              <span className="flex items-center gap-2">
                <o.icon className="h-4 w-4" />
                {o.label}
              </span>
              <Kbd>{o.kbd}</Kbd>
            </button>
          ))}
          <button
            type="button"
            disabled={posting || !!followUp}
            onClick={skip}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg border border-input px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent',
              'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <span className="flex items-center gap-2">
              <SkipForward className="h-4 w-4" />
              Skip
            </span>
            <Kbd>S</Kbd>
          </button>
        </div>
      </div>

      {/* Running tally */}
      {(called > 0 || skipped > 0) && (
        <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{called} logged</span>
          {OUTCOMES.filter((o) => (tally[o.outcome] ?? 0) > 0).map((o) => (
            <span key={o.outcome}>{o.label}: {tally[o.outcome]}</span>
          ))}
          {skipped > 0 && <span>Skipped: {skipped}</span>}
        </div>
      )}

      {/* Optional full lead panel — opened from the lead name / "Full profile". */}
      {panelOpen && lead && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setPanelOpen(false)} />
          <LeadFullPanel
            leadId={lead.id}
            teamMembers={teamMembers}
            isAdmin={isAdmin}
            currentUserId={currentUserId ?? ''}
            canEditBatch={isAdmin}
            onClose={() => setPanelOpen(false)}
            onLeadChange={() => {}}
          />
        </>
      )}
    </div>
  )
}

function TargetProgress({ called, target }: { called: number; target: number }) {
  if (target <= 0) return null
  const pct = Math.min(100, Math.round((called / target) * 100))
  const hit = called >= target
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Leads called today (daily target)</span>
        <span className={cn('font-semibold tabular-nums', hit ? 'text-emerald-600' : 'text-foreground')}>
          {called} / {target}{hit ? ' — target hit!' : ''}
        </span>
      </div>
      {/* Decorative — the visible "called / target" text above carries the value. */}
      <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', hit ? 'bg-emerald-500' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] leading-none opacity-70">
      {children}
    </kbd>
  )
}
