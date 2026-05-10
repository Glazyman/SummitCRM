'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Phone, ArrowUpRight, CheckCircle2, Circle, Clock,
  Plus, X,
  User, Mail, Building2, ExternalLink, Calendar, PhoneMissed,
  PhoneOff, PhoneCall, Voicemail, RotateCcw,
} from 'lucide-react'
import { STATUS_CONFIG, ALL_STATUSES, INTEREST_CONFIG, ALL_INTEREST_STATUSES } from '@/components/leads/status-config'
import type { LeadStatus } from '@/components/leads/types'
import type { InterestStatus } from '@/types/database'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

// ── Types ─────────────────────────────────────────────────────────────────────
type Priority = 'high' | 'medium' | 'low'
type ActivityType = 'follow_up' | 'callback'

interface Lead {
  id: string
  first_name: string | null
  last_name:  string | null
  email:      string
  phone:      string | null
  company:    string | null
}

interface Activity {
  id:           string
  type:         ActivityType
  priority:     Priority
  title:        string
  notes:        string | null
  due_at:       string
  completed_at: string | null
  assigned_to:  string | null
  created_at:   string
  lead:         Lead | null
}

function leadName(lead: Lead | null) {
  if (!lead) return '—'
  const n = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  return n || lead.email
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (diffDays < 0)   return { label: `${Math.abs(diffDays)}d overdue`, overdue: true }
  if (diffDays === 0)  return { label: 'Today',    overdue: false }
  if (diffDays === 1)  return { label: 'Tomorrow', overdue: false }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false }
}

// ── Shared select style ────────────────────────────────────────────────────────
const selectCls = 'h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

// ── Activity side panel ────────────────────────────────────────────────────────
const CALL_OUTCOMES = [
  { id: 'answered',           label: 'Answered',  icon: PhoneCall,   color: 'bg-emerald-500/10 text-emerald-700 border-emerald-300 data-[sel=true]:bg-emerald-500 data-[sel=true]:text-white data-[sel=true]:border-emerald-600' },
  { id: 'voicemail',          label: 'Voicemail', icon: Voicemail,   color: 'bg-purple-500/10 text-purple-700 border-purple-300 data-[sel=true]:bg-purple-500 data-[sel=true]:text-white data-[sel=true]:border-purple-600' },
  { id: 'no_answer',          label: 'No Answer', icon: PhoneMissed, color: 'bg-orange-500/10 text-orange-700 border-orange-300 data-[sel=true]:bg-orange-500 data-[sel=true]:text-white data-[sel=true]:border-orange-600' },
  { id: 'wrong_number',       label: 'Wrong #',   icon: PhoneOff,    color: 'bg-red-500/10 text-red-700 border-red-300 data-[sel=true]:bg-red-500 data-[sel=true]:text-white data-[sel=true]:border-red-600' },
] as const

function ActivityPanel({
  activity,
  onClose,
  onDone,
  onActivityUpdated,
}: {
  activity:           Activity
  onClose:            () => void
  onDone:             () => void
  onActivityUpdated?: (id: string, patch: Partial<Activity>) => void
}) {
  const done = !!activity.completed_at
  const name = leadName(activity.lead)

  // Lead status/interest (fetched on open)
  const [leadStatus,   setLeadStatus]   = useState<LeadStatus | null>(null)
  const [leadInterest, setLeadInterest] = useState<InterestStatus | null>(null)

  // Reschedule — separate date and time
  const [rescheduling, setRescheduling] = useState(false)
  const [newDate,      setNewDate]      = useState(activity.due_at.slice(0, 10))
  const [newTime,      setNewTime]      = useState(activity.due_at.slice(11, 16))
  const [savingDue,    setSavingDue]    = useState(false)

  // Activity notes editing
  const [editingNotes, setEditingNotes] = useState(false)
  const [actNotes,     setActNotes]     = useState(activity.notes ?? '')
  const [savingNotes,  setSavingNotes]  = useState(false)

  // Log call
  const [callOutcome,  setCallOutcome]  = useState<string | null>(null)
  const [callNotes,    setCallNotes]    = useState('')
  const [loggingCall,  setLoggingCall]  = useState(false)
  const [callLogged,   setCallLogged]   = useState(false)

  // Status/interest saving
  const [savingStatus,   setSavingStatus]   = useState(false)
  const [savingInterest, setSavingInterest] = useState(false)

  // Fetch lead status/interest
  useEffect(() => {
    if (!activity.lead?.id) return
    fetch(`/api/leads/${activity.lead.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.lead) {
          setLeadStatus(d.lead.status ?? null)
          setLeadInterest(d.lead.interest_status ?? null)
        }
      })
      .catch(() => {})
  }, [activity.lead?.id])

  async function handleReschedule() {
    if (!newDate || !newTime) return
    const combined = new Date(`${newDate}T${newTime}:00`)
    setSavingDue(true)
    try {
      const res = await fetch(`/api/activities/${activity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueAt: combined.toISOString() }),
      })
      if (res.ok) {
        onActivityUpdated?.(activity.id, { due_at: combined.toISOString() })
        setRescheduling(false)
      }
    } finally { setSavingDue(false) }
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/activities/${activity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: actNotes || null }),
      })
      if (res.ok) {
        onActivityUpdated?.(activity.id, { notes: actNotes || null })
        setEditingNotes(false)
      }
    } finally { setSavingNotes(false) }
  }

  async function handleLogCall() {
    if (!callOutcome || !activity.lead?.id) return
    setLoggingCall(true)
    try {
      await fetch(`/api/leads/${activity.lead.id}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: callOutcome, notes: callNotes || null, duration_sec: null }),
      })
      // Auto-update lead status based on outcome
      const outcomeToStatus: Record<string, LeadStatus> = {
        answered: 'called', voicemail: 'voicemail', no_answer: 'no_answer', wrong_number: 'wrong_number',
      }
      const newStatus = outcomeToStatus[callOutcome]
      if (newStatus) {
        await fetch(`/api/leads/${activity.lead.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
        setLeadStatus(newStatus)
      }
      setCallLogged(true)
      setCallOutcome(null)
      setCallNotes('')
      setTimeout(() => setCallLogged(false), 2500)
    } finally { setLoggingCall(false) }
  }

  async function handleStatusChange(s: LeadStatus) {
    if (!activity.lead?.id) return
    setSavingStatus(true)
    setLeadStatus(s)
    try {
      await fetch(`/api/leads/${activity.lead.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: s }),
      })
    } finally { setSavingStatus(false) }
  }

  async function handleInterestChange(s: InterestStatus) {
    if (!activity.lead?.id) return
    setSavingInterest(true)
    setLeadInterest(s)
    try {
      await fetch(`/api/leads/${activity.lead.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest_status: s }),
      })
    } finally { setSavingInterest(false) }
  }

  // Calendar display helpers
  const dueDate  = new Date(activity.due_at)
  const dayName  = dueDate.toLocaleDateString('en-US', { weekday: 'short' })
  const monthDay = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const timeStr  = dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const isOverdue = !done && dueDate < new Date()

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
            activity.type === 'callback' ? 'bg-blue-500/10 text-blue-600' : 'bg-violet-500/10 text-violet-600'
          )}>
            {activity.type === 'callback' ? <Phone className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
            {activity.type === 'callback' ? 'Call Back' : 'Follow-up'}
          </span>
          {done && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3 w-3" />Completed</span>}
        </div>
        <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Calendar block ── */}
        <div className={cn('px-5 py-4 border-b border-border', isOverdue ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/30')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-12 w-12 flex-col items-center justify-center rounded-xl border-2 text-center',
                isOverdue ? 'border-red-400 bg-red-500 text-white' : 'border-border bg-card'
              )}>
                <span className="text-[10px] font-semibold uppercase leading-none">{dayName}</span>
                <span className="text-lg font-bold leading-tight">{dueDate.getDate()}</span>
              </div>
              <div>
                <p className={cn('text-sm font-semibold', isOverdue && 'text-red-600')}>{monthDay}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />{timeStr}
                  {isOverdue && <span className="text-red-500 font-medium ml-1">· Overdue</span>}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRescheduling(!rescheduling)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <RotateCcw className="h-3 w-3" /> Reschedule
            </button>
          </div>

          {/* Reschedule picker */}
          {rescheduling && (
            <div className="mt-3 space-y-3 rounded-xl border border-border bg-background p-3">
              {/* Quick picks */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Today · 5pm',   offset: 0, hour: 17, min: 0 },
                  { label: 'Tomorrow · 9am', offset: 1, hour: 9,  min: 0 },
                  { label: 'In 2 days',      offset: 2, hour: 9,  min: 0 },
                ].map(q => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + q.offset)
                      d.setHours(q.hour, q.min, 0, 0)
                      setNewDate(d.toISOString().slice(0, 10))
                      setNewTime(`${String(q.hour).padStart(2,'0')}:${String(q.min).padStart(2,'0')}`)
                    }}
                    className="rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              {/* Date + Time pickers */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Date
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Time
                  </label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              {newDate && newTime && (
                <p className="text-xs text-muted-foreground">
                  Scheduled for {new Date(`${newDate}T${newTime}`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(`${newDate}T${newTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setRescheduling(false)} className="flex-1 rounded-lg border border-border py-1.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="button" onClick={handleReschedule} disabled={savingDue || !newDate || !newTime} className="flex-1 rounded-lg bg-primary text-primary-foreground py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                  {savingDue ? 'Saving…' : 'Save Time'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Task + Notes ── */}
        <div className="px-5 py-4 border-b border-border space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Task</p>
          <p className="font-semibold">{activity.title}</p>
          {/* Notes */}
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                value={actNotes}
                onChange={e => setActNotes(e.target.value)}
                rows={3}
                placeholder="Add notes…"
                autoFocus
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditingNotes(false); setActNotes(activity.notes ?? '') }} className="flex-1 rounded-lg border border-border py-1.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="button" onClick={handleSaveNotes} disabled={savingNotes} className="flex-1 rounded-lg bg-primary text-primary-foreground py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                  {savingNotes ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="w-full text-left rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
            >
              {actNotes || <span className="italic">Add notes…</span>}
            </button>
          )}
        </div>

        {/* ── Contact info ── */}
        {activity.lead && (
          <div className="px-5 py-4 border-b border-border space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{name}</p>
                {activity.lead.company && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Building2 className="h-3 w-3" />{activity.lead.company}
                  </p>
                )}
              </div>
              <Link href={`/leads/${activity.lead.id}`} onClick={onClose}
                className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0">
                <ExternalLink className="h-3.5 w-3.5" /> View lead
              </Link>
            </div>
            {activity.lead.phone && (
              <a href={`tel:${activity.lead.phone}`} className="flex items-center gap-2.5 text-sm hover:text-primary transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{activity.lead.phone}
              </a>
            )}
            {activity.lead.email && (
              <a href={`mailto:${activity.lead.email}`} className="flex items-center gap-2.5 text-sm text-primary hover:underline">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{activity.lead.email}</span>
              </a>
            )}
          </div>
        )}

        {/* ── Log a call ── */}
        <div className="px-5 py-4 border-b border-border space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Log Call</p>
          <div className="grid grid-cols-2 gap-2">
            {CALL_OUTCOMES.map(o => {
              const Icon = o.icon
              const selected = callOutcome === o.id
              return (
                <button
                  key={o.id}
                  type="button"
                  data-sel={selected}
                  onClick={() => setCallOutcome(selected ? null : o.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                    o.color
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />{o.label}
                </button>
              )
            })}
          </div>
          {callOutcome && (
            <>
              <textarea
                placeholder="Notes (optional)…"
                value={callNotes}
                onChange={e => setCallNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handleLogCall}
                disabled={loggingCall}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <Phone className="h-3.5 w-3.5" />
                {loggingCall ? 'Logging…' : callLogged ? '✓ Call logged!' : 'Log Call'}
              </button>
            </>
          )}
          {callLogged && !callOutcome && (
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Call logged successfully</p>
          )}
        </div>

        {/* ── Status & Interest ── */}
        {activity.lead && (
          <div className="px-5 py-4 border-b border-border space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Lead Status</p>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_STATUSES.map(s => {
                  const m = STATUS_CONFIG[s]
                  const sel = leadStatus === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleStatusChange(s)}
                      disabled={savingStatus}
                      className={cn(
                        'rounded-lg border px-2.5 py-1.5 text-xs font-medium text-left transition-all',
                        sel ? m.badge : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Interest Level</p>
              <div className="grid grid-cols-3 gap-1.5">
                {ALL_INTEREST_STATUSES.map(s => {
                  const m = INTEREST_CONFIG[s]
                  const sel = leadInterest === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleInterestChange(s)}
                      disabled={savingInterest}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-xs font-medium text-center transition-all',
                        sel ? m.badge : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border px-5 py-4 shrink-0">
        {done ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /><span className="font-medium">Completed</span></div>
            <button type="button" onClick={onDone} className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">Mark as open again</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onDone}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" /> Mark Done
          </button>
        )}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  initialActivities: Activity[]
  teamMembers:       { id: string; name: string }[]
  currentUserId:     string
  isAdmin?:          boolean
}

export function ActivitiesClient({ initialActivities, teamMembers, currentUserId, isAdmin }: Props) {
  const [activities,      setActivities]      = useState<Activity[]>(initialActivities)
  const [justCompleted,   setJustCompleted]   = useState<Set<string>>(new Set())
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [search,          setSearch]          = useState('')
  const [filterType,      setFilterType]      = useState('')
  const [filterAssigned,  setFilterAssigned]  = useState('')
  const [filterDone,      setFilterDone]      = useState('false')
  const [showNew,         setShowNew]         = useState(false)
  const [saving,          setSaving]          = useState(false)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivities(initialActivities)
  }, [initialActivities])

  // ── New form ──────────────────────────────────────────────────────────────
  const [newForm, setNewForm] = useState(() => ({
    leadId:     '',
    type:       'follow_up' as ActivityType,
    priority:   'medium'   as Priority,
    title:      '',
    notes:      '',
    dueAt:      new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    assignedTo: currentUserId,
  }))

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return activities.filter((a) => {
      if (filterType     && a.type        !== filterType)     return false
      if (filterAssigned && a.assigned_to !== filterAssigned) return false
      // For filterDone: if item is justCompleted, keep it visible briefly
      if (filterDone === 'true'  && !a.completed_at && !justCompleted.has(a.id)) return false
      if (filterDone === 'false' &&  a.completed_at && !justCompleted.has(a.id)) return false
      if (q) {
        const hay = [a.title, leadName(a.lead), a.lead?.company, a.lead?.email, a.lead?.phone]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [activities, search, filterType, filterAssigned, filterDone, justCompleted])

  // ── Toggle done (with brief visual linger) ────────────────────────────────
  async function toggleDone(activity: Activity) {
    const nowDone = !activity.completed_at
    const updatedAt = nowDone ? new Date().toISOString() : null

    setActivities((prev) => prev.map((a) =>
      a.id === activity.id ? { ...a, completed_at: updatedAt } : a
    ))
    if (selectedActivity?.id === activity.id) {
      setSelectedActivity((s) => s ? { ...s, completed_at: updatedAt } : s)
    }

    if (nowDone) {
      setJustCompleted((s) => new Set([...s, activity.id]))
      const t = setTimeout(() => {
        setJustCompleted((s) => { const n = new Set(s); n.delete(activity.id); return n })
        setSelectedActivity((s) => s?.id === activity.id ? null : s)
      }, 1200)
      timers.current.set(activity.id, t)
    } else {
      const t = timers.current.get(activity.id)
      if (t) { clearTimeout(t); timers.current.delete(activity.id) }
      setJustCompleted((s) => { const n = new Set(s); n.delete(activity.id); return n })
    }

    await fetch(`/api/activities/${activity.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ completed: nowDone }),
    })
  }

  async function deleteActivity(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id))
    await fetch(`/api/activities/${id}`, { method: 'DELETE' })
  }

  async function handleCreate() {
    if (!newForm.title.trim() || !newForm.leadId) return
    setSaving(true)
    try {
      const res = await fetch('/api/activities', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          leadId:     newForm.leadId,
          type:       newForm.type,
          priority:   newForm.priority,
          title:      newForm.title,
          notes:      newForm.notes || undefined,
          dueAt:      new Date(newForm.dueAt).toISOString(),
          assignedTo: newForm.assignedTo || null,
        }),
      })
      if (res.ok) {
        const listRes = await fetch('/api/activities?done=false')
        const json = await listRes.json() as { data?: { activities: Activity[] } }
        if (json.data?.activities) setActivities(json.data.activities)
        setShowNew(false)
        setNewForm({ leadId: '', type: 'follow_up', priority: 'medium', title: '', notes: '',
          dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16), assignedTo: currentUserId })
      }
    } finally { setSaving(false) }
  }

  const openCount    = activities.filter((a) => !a.completed_at).length
  const overdueCount = activities.filter((a) => !a.completed_at && new Date(a.due_at) < new Date()).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {openCount} open
            {overdueCount > 0 && <span className="text-red-500 font-medium"> · {overdueCount} overdue</span>}
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Activity
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-48 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={selectCls}>
          <option value="">All types</option>
          <option value="follow_up">Follow-up</option>
          <option value="callback">Callback</option>
        </select>

        {isAdmin && (
          <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)} className={selectCls}>
            <option value="">All reps</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}

        <select value={filterDone} onChange={(e) => setFilterDone(e.target.value)} className={selectCls}>
          <option value="false">Open</option>
          <option value="true">Past / Completed</option>
          <option value="">All</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Task</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Contact</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Company</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Phone</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Due</th>
              {isAdmin && <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Rep</th>}
              <th className="w-8 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-muted-foreground text-sm">
                  {activities.length === 0 ? 'No activities yet.' : 'No activities match the current filters.'}
                </td>
              </tr>
            )}
            {filtered.map((a) => {
              const due   = fmtDate(a.due_at)
              const done  = !!a.completed_at
              const linger = justCompleted.has(a.id)
              const assignee = teamMembers.find((m) => m.id === a.assigned_to)

              return (
                <tr
                  key={a.id}
                  onClick={() => setSelectedActivity(a)}
                  className={cn(
                    'group transition-all cursor-pointer',
                    done && !linger ? 'opacity-40' : 'hover:bg-muted/30',
                    linger && 'bg-emerald-50/50 dark:bg-emerald-950/20',
                    selectedActivity?.id === a.id && 'bg-primary/5'
                  )}
                >
                  {/* Complete toggle */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleDone(a)}
                      className={cn(
                        'transition-all',
                        done ? 'text-emerald-500' : 'text-muted-foreground hover:text-primary'
                      )}
                      title={done ? 'Mark open' : 'Mark done'}
                    >
                      {done
                        ? <CheckCircle2 className={cn('h-4 w-4', linger && 'scale-110')} />
                        : <Circle className="h-4 w-4" />
                      }
                    </button>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                      a.type === 'callback' ? 'bg-blue-500/10 text-blue-600' : 'bg-violet-500/10 text-violet-600'
                    )}>
                      {a.type === 'callback' ? <Phone className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {a.type === 'callback' ? 'Call Back' : 'Follow-up'}
                    </span>
                  </td>

                  {/* Task */}
                  <td className="px-3 py-3 max-w-[180px]">
                    <p className={cn('truncate font-medium text-sm', done && 'line-through text-muted-foreground')}>
                      {a.title}
                    </p>
                    {a.notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.notes}</p>
                    )}
                  </td>

                  {/* Contact */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {a.lead ? (
                      <Link href={`/leads/${a.lead.id}`} className="font-medium hover:text-primary hover:underline underline-offset-2 text-sm">
                        {leadName(a.lead)}
                      </Link>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Company */}
                  <td className="px-3 py-3 text-sm text-muted-foreground">{a.lead?.company ?? '—'}</td>

                  {/* Phone */}
                  <td className="px-3 py-3 text-xs text-muted-foreground font-mono">{a.lead?.phone ?? '—'}</td>

                  {/* Due */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={cn('flex items-center gap-1 text-xs font-medium', due.overdue ? 'text-red-500' : 'text-muted-foreground')}>
                      <Clock className="h-3 w-3 shrink-0" />
                      {due.label}
                    </span>
                  </td>

                  {/* Rep (admin only) */}
                  {isAdmin && (
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        {assignee?.name ?? '—'}
                      </span>
                    </td>
                  )}

                  {/* Delete */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => deleteActivity(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      title="Delete"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Activity side panel */}
      {selectedActivity && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelectedActivity(null)} />
          <ActivityPanel
            activity={selectedActivity}
            onClose={() => setSelectedActivity(null)}
            onDone={() => toggleDone(selectedActivity)}
            onActivityUpdated={(id, patch) => {
              setActivities(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
              setSelectedActivity(prev => prev?.id === id ? { ...prev, ...patch } : prev)
            }}
          />
        </>
      )}

      {/* New Activity Dialog */}
      <Dialog open={showNew} onClose={() => setShowNew(false)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>New Activity</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select value={newForm.type} onChange={(e) => setNewForm((f) => ({ ...f, type: e.target.value as ActivityType }))} className={cn(selectCls, 'w-full')}>
                  <option value="follow_up">Follow-up</option>
                  <option value="callback">Call Back</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <select value={newForm.priority} onChange={(e) => setNewForm((f) => ({ ...f, priority: e.target.value as Priority }))} className={cn(selectCls, 'w-full')}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Call back about proposal" value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Lead ID <span className="text-destructive">*</span></Label>
                <Input placeholder="Paste lead ID from the URL" value={newForm.leadId} onChange={(e) => setNewForm((f) => ({ ...f, leadId: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Open a lead and copy the ID from the URL bar.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date <span className="text-destructive">*</span></Label>
                <Input type="datetime-local" value={newForm.dueAt} onChange={(e) => setNewForm((f) => ({ ...f, dueAt: e.target.value }))} />
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Assign to</Label>
                  <select value={newForm.assignedTo} onChange={(e) => setNewForm((f) => ({ ...f, assignedTo: e.target.value }))} className={cn(selectCls, 'w-full')}>
                    {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              <div className={cn('space-y-1.5', isAdmin ? '' : 'col-span-2')}>
                <Label>Notes</Label>
                <textarea
                  placeholder="Optional notes…"
                  value={newForm.notes}
                  onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newForm.title.trim() || !newForm.leadId || saving} loading={saving}>
              Create Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
