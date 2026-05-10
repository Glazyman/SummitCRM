'use client'

import * as React from 'react'
import Link from 'next/link'
import { Activity, Clock, Phone, X, ExternalLink, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { STATUS_CONFIG, ALL_STATUSES, INTEREST_CONFIG, ALL_INTEREST_STATUSES } from '@/components/leads/status-config'
import { LeadProfileCard }  from '@/components/leads/detail/lead-profile-card'
import { ActivityTimeline } from '@/components/leads/detail/activity-timeline'
import { NoteEditor }       from '@/components/leads/detail/note-editor'
import { FollowUpSection }  from '@/components/leads/detail/follow-up-section'
import { CallHistory }      from '@/components/leads/detail/call-history'
import type {
  LeadDetail, ActivityEntry,
  FollowUp, NewFollowUp, TeamMember, LeadStatus,
} from '@/components/leads/detail/types'
import type { CallLogItem, NewCall } from '@/components/leads/detail/call-history'
import type { InterestStatus } from '@/types/database'

// ── Tabs ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'activity',  label: 'Activity',   Icon: Activity },
  { id: 'followups', label: 'Follow-ups', Icon: Clock    },
  { id: 'calls',     label: 'Calls',      Icon: Phone    },
] as const

type TabId = typeof TABS[number]['id']

// ── Props ─────────────────────────────────────────────────────────────────
export interface LeadFullPanelProps {
  leadId:        string
  teamMembers:   TeamMember[]
  isAdmin:       boolean
  currentUserId: string
  canEditBatch:  boolean
  onClose:       () => void
  /** Propagate status/interest changes back to the leads table */
  onLeadChange:  (patch: { status?: LeadStatus; interest_status?: InterestStatus }) => void
}

interface PanelData {
  lead:      LeadDetail
  activity:  ActivityEntry[]
  followUps: FollowUp[]
  calls:     CallLogItem[]
}

// ── Component ─────────────────────────────────────────────────────────────
export function LeadFullPanel({
  leadId,
  teamMembers: parentTeamMembers,
  isAdmin,
  currentUserId,
  canEditBatch,
  onClose,
  onLeadChange,
}: LeadFullPanelProps) {
  const [data,      setData]      = React.useState<PanelData | null>(null)
  const [loading,   setLoading]   = React.useState(true)
  const [activeTab, setActiveTab] = React.useState<TabId>('activity')

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    fetch(`/api/leads/${leadId}/full`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d) })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [leadId])

  // Use team members from API (includes names), fall back to parent list
  const teamMembers = data ? (data as unknown as { teamMembers?: TeamMember[] }).teamMembers ?? parentTeamMembers : parentTeamMembers

  // ── Profile mutations ─────────────────────────────────────────────────
  async function handleSaveProfile(patch: Partial<LeadDetail>) {
    if (!data) return
    const prev = data.lead
    setData((d) => d ? { ...d, lead: { ...d.lead, ...patch } } : d)
    try {
      const res  = await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const json = await res.json()
      setData((d) => d ? { ...d, lead: { ...d.lead, ...json.lead, batch_name: d.lead.batch_name, assigned_name: d.lead.assigned_name } } : d)
      if (patch.status)          onLeadChange({ status: patch.status as LeadStatus })
      if (patch.interest_status) onLeadChange({ interest_status: patch.interest_status as InterestStatus })
    } catch {
      setData((d) => d ? { ...d, lead: prev } : d)
    }
  }

  async function handleStatusChange(status: LeadStatus) {
    if (!data) return
    const prev = data.lead.status
    setData((d) => d ? { ...d, lead: { ...d.lead, status } } : d)
    onLeadChange({ status })
    try {
      await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    } catch {
      setData((d) => d ? { ...d, lead: { ...d.lead, status: prev } } : d)
      onLeadChange({ status: prev })
    }
  }

  async function handleInterestChange(interest_status: InterestStatus) {
    if (!data) return
    const prev = data.lead.interest_status
    setData((d) => d ? { ...d, lead: { ...d.lead, interest_status } } : d)
    onLeadChange({ interest_status })
    try {
      await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interest_status }) })
    } catch {
      setData((d) => d ? { ...d, lead: { ...d.lead, interest_status: prev } } : d)
      onLeadChange({ interest_status: prev })
    }
  }

  async function handleRenameBatch(name: string) {
    if (!data?.lead.batch_id) return
    await fetch(`/api/batches/${data.lead.batch_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    setData((d) => d ? { ...d, lead: { ...d.lead, batch_name: name } } : d)
  }

  // ── Note mutations ────────────────────────────────────────────────────
  async function handleAddNote(content: string) {
    const res  = await fetch(`/api/leads/${leadId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
    const json = await res.json()
    const note = json.note
    const entry: ActivityEntry = {
      id:            `note-${note.id}`,
      source:        'note',
      type:          'note_added',
      user_id:       note.author_id,
      user_name:     teamMembers.find((m) => m.id === note.author_id)?.name ?? 'You',
      user_initials: null,
      created_at:    note.created_at,
      metadata:      {},
      note_id:       note.id,
      note_content:  note.content,
      note_editable: true,
    }
    setData((d) => d ? { ...d, activity: [entry, ...d.activity] } : d)
    setActiveTab('activity')
  }

  async function handleEditNote(noteId: string, content: string) {
    setData((d) => d ? { ...d, activity: d.activity.map((e) => e.note_id === noteId ? { ...e, note_content: content } : e) } : d)
    await fetch(`/api/leads/${leadId}/notes/${noteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }).catch(console.error)
  }

  async function handleDeleteNote(noteId: string) {
    setData((d) => d ? { ...d, activity: d.activity.filter((e) => e.note_id !== noteId) } : d)
    await fetch(`/api/leads/${leadId}/notes/${noteId}`, { method: 'DELETE' }).catch(console.error)
  }

  async function handleDeleteActivity(activityId: string) {
    setData((d) => d ? { ...d, activity: d.activity.filter((e) => e.id !== activityId) } : d)
    if (!activityId.startsWith('act-')) {
      await fetch(`/api/leads/${leadId}/activity/${activityId}`, { method: 'DELETE' }).catch(console.error)
    }
  }

  // ── Follow-up mutations ───────────────────────────────────────────────
  async function handleAddFollowUp(followUp: NewFollowUp) {
    const res  = await fetch(`/api/leads/${leadId}/follow-ups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(followUp) })
    const json = await res.json()
    const member = teamMembers.find((m) => m.id === json.follow_up.assigned_to)
    setData((d) => d ? { ...d, followUps: [{ ...json.follow_up, is_completed: false, assigned_name: member?.name ?? null }, ...d.followUps] } : d)
  }

  async function handleCompleteFollowUp(id: string) {
    const completedAt = new Date().toISOString()
    setData((d) => d ? { ...d, followUps: d.followUps.map((f) => f.id === id ? { ...f, is_completed: true, completed_at: completedAt } : f) } : d)
    await fetch(`/api/leads/${leadId}/follow-ups/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed_at: completedAt }) }).catch(console.error)
  }

  async function handleDeleteFollowUp(id: string) {
    setData((d) => d ? { ...d, followUps: d.followUps.filter((f) => f.id !== id) } : d)
    await fetch(`/api/leads/${leadId}/follow-ups/${id}`, { method: 'DELETE' }).catch(console.error)
  }

  // ── Call mutations — auto-syncs lead status to call outcome ──────────
  async function handleLogCall(call: NewCall) {
    const res  = await fetch(`/api/leads/${leadId}/calls`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(call) })
    const json = await res.json()
    setData((d) => d ? { ...d, calls: [{ ...json.call, logger_name: 'You' }, ...d.calls] } : d)

    const outcomeToStatus: Partial<Record<typeof call.outcome, LeadStatus>> = {
      answered:           'called',
      voicemail:          'voicemail',
      no_answer:          'no_answer',
      wrong_number:       'wrong_number',
      callback_requested: 'called',
    }
    const newStatus = outcomeToStatus[call.outcome]
    if (newStatus) await handleStatusChange(newStatus)
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const lead             = data?.lead
  const name             = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email : '…'
  const pendingFollowUps = data?.followUps.filter((f) => !f.is_completed).length ?? 0

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-4xl flex-col border-l border-border bg-background shadow-2xl">

      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{name}</p>
          {lead?.company && (
            <p className="text-xs text-muted-foreground truncate">{lead.company}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/leads/${leadId}`}
            className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Full profile
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      )}

      {/* ── Content ── */}
      {!loading && lead && data && (
        <div className="flex flex-1 overflow-hidden">

          {/* Profile card — fixed-width left column */}
          <div className="w-72 xl:w-80 shrink-0 overflow-y-auto border-r border-border bg-card">
            <LeadProfileCard
              lead={lead}
              teamMembers={teamMembers}
              onSave={handleSaveProfile}
              onRenameBatch={canEditBatch ? handleRenameBatch : undefined}
              canEditBatch={canEditBatch}
            />
          </div>

          {/* Tabbed right column */}
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">

            {/* Tab bar + status/interest dropdowns */}
            <div className="flex shrink-0 items-center border-b border-border bg-card">
              {/* Tabs */}
              <div className="flex flex-1 overflow-x-auto scrollbar-hide">
                {TABS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap',
                      activeTab === id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {id === 'followups' && pendingFollowUps > 0 && (
                      <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                        {pendingFollowUps}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Status + Interest dropdowns */}
              <div className="flex shrink-0 items-center gap-1.5 border-l border-border px-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn('h-7 gap-1 px-2 text-xs font-medium whitespace-nowrap', STATUS_CONFIG[lead.status].badge)}
                    >
                      {STATUS_CONFIG[lead.status].label}
                      <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" minWidth="170px">
                    <DropdownMenuLabel>Change status</DropdownMenuLabel>
                    {ALL_STATUSES.map((s) => {
                      const m = STATUS_CONFIG[s]
                      return (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={cn(s === lead.status && 'opacity-50 cursor-default')}
                        >
                          <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />
                          {m.label}
                          {s === lead.status && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn('h-7 gap-1 px-2 text-xs font-medium whitespace-nowrap', INTEREST_CONFIG[lead.interest_status].badge)}
                    >
                      {INTEREST_CONFIG[lead.interest_status].icon} {INTEREST_CONFIG[lead.interest_status].label}
                      <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" minWidth="160px">
                    <DropdownMenuLabel>Interest level</DropdownMenuLabel>
                    {ALL_INTEREST_STATUSES.map((s) => {
                      const m = INTEREST_CONFIG[s]
                      return (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => handleInterestChange(s)}
                          className={cn(s === lead.interest_status && 'opacity-50 cursor-default')}
                        >
                          <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />
                          {m.icon} {m.label}
                          {s === lead.interest_status && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === 'activity' && (
                <div className="space-y-5">
                  <NoteEditor onSave={handleAddNote} />
                  <ActivityTimeline
                    entries={data.activity}
                    onEditNote={handleEditNote}
                    onDeleteNote={handleDeleteNote}
                    onDeleteActivity={handleDeleteActivity}
                  />
                </div>
              )}
              {activeTab === 'followups' && (
                <FollowUpSection
                  followUps={data.followUps}
                  teamMembers={teamMembers}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  onAdd={handleAddFollowUp}
                  onComplete={handleCompleteFollowUp}
                  onDelete={handleDeleteFollowUp}
                />
              )}
              {activeTab === 'calls' && (
                <CallHistory
                  calls={data.calls}
                  onLogCall={handleLogCall}
                  currentUserId={currentUserId}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
