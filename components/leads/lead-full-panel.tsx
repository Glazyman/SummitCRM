'use client'

import * as React from 'react'
import Link from 'next/link'
import { Activity, Clock, Phone, X, ExternalLink, ChevronDown, CheckCircle2, ClipboardList } from 'lucide-react'
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
import { Questionnaire }   from '@/components/leads/detail/questionnaire'
import type { QuestionnaireData } from '@/components/leads/detail/questionnaire'
import { prepareSnapshotEmail } from '@/lib/intake-snapshot'
import type {
  LeadDetail, ActivityEntry,
  FollowUp, NewFollowUp, TeamMember, LeadStatus,
} from '@/components/leads/detail/types'
import type { CallLogItem } from '@/components/leads/detail/call-history'
import type { InterestStatus } from '@/types/database'

// ── Tabs ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'activity',      label: 'Activity',      Icon: Activity      },
  { id: 'followups',     label: 'Follow-ups',    Icon: Clock         },
  { id: 'calls',         label: 'Calls',         Icon: Phone         },
  { id: 'questionnaire', label: 'Intake',         Icon: ClipboardList },
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
  /** Propagate lead field changes back to the parent list */
  onLeadChange:  (patch: Partial<LeadDetail>) => void
  /** When opened from the activities view — shows a Mark Done button in the header */
  activityDone?:         boolean
  onMarkActivityDone?:   () => void
  /** Override panel positioning (e.g. shift left when a sibling panel is open) */
  style?: React.CSSProperties
}

interface PanelData {
  lead:      LeadDetail
  activity:  ActivityEntry[]
  followUps: FollowUp[]
  calls:     CallLogItem[]
}

function tomorrowAt11LocalIso() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(11, 0, 0, 0)
  return d.toISOString()
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
  activityDone,
  onMarkActivityDone,
  style,
}: LeadFullPanelProps) {
  const [data,             setData]             = React.useState<PanelData | null>(null)
  const [loading,          setLoading]          = React.useState(true)
  const [activeTab,        setActiveTab]        = React.useState<TabId>('activity')
  const [followUpPrompt,   setFollowUpPrompt]   = React.useState<{ title: string; notes: string | null; due_at: string } | null>(null)
  const [questionnaireData, setQuestionnaireData] = React.useState<QuestionnaireData | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    Promise.all([
      fetch(`/api/leads/${leadId}/full`).then((r) => r.json()),
      fetch(`/api/leads/${leadId}/questionnaire`).then((r) => r.json()).catch(() => ({ questionnaire: null })),
    ]).then(([leadData, qData]) => {
      if (!cancelled) {
        setData(leadData)
        setQuestionnaireData(qData.questionnaire ?? null)
      }
    }).catch(console.error)
    .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [leadId])

  // Use team members from API (includes names), fall back to parent list
  const teamMembers = data ? (data as unknown as { teamMembers?: TeamMember[] }).teamMembers ?? parentTeamMembers : parentTeamMembers

  // ── Questionnaire save ────────────────────────────────────────────────
  async function handleSaveQuestionnaire(qData: QuestionnaireData) {
    await fetch(`/api/leads/${leadId}/questionnaire`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(qData),
    })
    setQuestionnaireData(qData)
  }

  // ── Profile mutations ─────────────────────────────────────────────────
  async function handleSaveProfile(patch: Partial<LeadDetail>) {
    if (!data) return
    const prev = data.lead
    setData((d) => d ? { ...d, lead: { ...d.lead, ...patch } } : d)
    try {
      const res  = await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Save failed')
      setData((d) => d ? { ...d, lead: { ...d.lead, ...json.lead, batch_name: d.lead.batch_name, assigned_name: d.lead.assigned_name } } : d)
      // Propagate all changed fields to the parent list (leads/pipeline)
      if (json.lead) onLeadChange(json.lead as Partial<LeadDetail>)
    } catch (err) {
      setData((d) => d ? { ...d, lead: prev } : d)
      throw err
    }
  }

  async function handleStatusChange(status: LeadStatus) {
    if (!data) return
    const prev = data.lead.status
    setData((d) => d ? { ...d, lead: { ...d.lead, status } } : d)
    onLeadChange({ status })
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.follow_up_suggestion) {
        setFollowUpPrompt({
          ...(json.follow_up_suggestion as { title: string; notes: string | null; due_at: string }),
          due_at: tomorrowAt11LocalIso(),
        })
      }
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
  async function handleAddNote(content: string, assignedTo: string[]) {
    const res  = await fetch(`/api/leads/${leadId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, assigned_to: assignedTo }),
    })
    const json = await res.json()
    if (!res.ok) {
      // Bubble up a real error so the editor can show it (e.g. "Reps can only assign to admins")
      throw new Error(json?.error ?? 'Failed to save note')
    }
    const note = json.note
    const primaryAssignee = note.assigned_to ?? (assignedTo[0] ?? null)
    const entry: ActivityEntry = {
      id:                    `note-${note.id}`,
      source:                'note',
      type:                  'note_added',
      user_id:               note.author_id,
      user_name:             teamMembers.find((m) => m.id === note.author_id)?.name ?? 'You',
      user_initials:         null,
      created_at:            note.created_at,
      metadata:              {},
      note_id:               note.id,
      note_content:          note.content,
      note_editable:         true,
      note_assigned_to:      primaryAssignee,
      note_assigned_to_name: primaryAssignee ? (teamMembers.find((m) => m.id === primaryAssignee)?.name ?? null) : null,
    }
    setData((d) => d ? { ...d, activity: [entry, ...d.activity] } : d)
    setActiveTab('activity')
  }

  // Recipients the current user is allowed to assign a note to.
  // - Reps  → admins / super_admins only
  // - Admins → other admins + the rep currently assigned to THIS lead.
  //   (Admins can't ping reps who don't own the lead.)
  const currentUserRole = teamMembers.find((m) => m.id === currentUserId)?.role
  const isCurrentRep   = currentUserRole === 'rep'
  const isCurrentAdmin = currentUserRole === 'admin' || currentUserRole === 'super_admin'
  const leadAssignedTo = data?.lead.assigned_to ?? null
  const noteRecipients = teamMembers
    .filter((m) => m.id !== currentUserId)
    .filter((m) => {
      const isMemberAdmin = m.role === 'admin' || m.role === 'super_admin'
      if (isCurrentRep)   return isMemberAdmin
      if (isCurrentAdmin) return isMemberAdmin || m.id === leadAssignedTo
      return false
    })
    .map((m) => ({ id: m.id, name: m.name, role: m.role }))

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

  async function handleEditFollowUp(id: string, data: { title: string; notes: string; due_at: string; assigned_to: string }) {
    const res  = await fetch(`/api/leads/${leadId}/follow-ups/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    const json = await res.json()
    if (res.ok && json.follow_up) {
      const member = teamMembers.find((m) => m.id === json.follow_up.assigned_to)
      setData((d) => d ? {
        ...d,
        followUps: d.followUps.map((f) =>
          f.id === id ? { ...f, ...json.follow_up, assigned_name: member?.name ?? f.assigned_name } : f
        ),
      } : d)
    }
  }

  async function handleDeleteFollowUp(id: string) {
    setData((d) => d ? { ...d, followUps: d.followUps.filter((f) => f.id !== id) } : d)
    await fetch(`/api/leads/${leadId}/follow-ups/${id}`, { method: 'DELETE' }).catch(console.error)
  }


  async function scheduleSuggestedFollowUp() {
    if (!followUpPrompt) return
    const res = await fetch(`/api/leads/${leadId}/follow-ups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(followUpPrompt),
    })
    const json = await res.json()
    if (res.ok && json.follow_up) {
      setData((d) => d ? {
        ...d,
        followUps: [
          {
            ...json.follow_up,
            is_completed: !!json.follow_up.completed_at,
            assigned_name: 'You',
          },
          ...d.followUps,
        ],
      } : d)
      setFollowUpPrompt(null)
      setActiveTab('followups')
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const lead             = data?.lead
  const name             = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email : '…'
  const pendingFollowUps = data?.followUps.filter((f) => !f.is_completed).length ?? 0

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-4xl flex-col border-l border-border bg-background shadow-2xl" style={style}>

      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{name}</p>
          {lead?.company && (
            <p className="text-xs text-muted-foreground truncate">{lead.company}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onMarkActivityDone && (
            <button
              type="button"
              onClick={onMarkActivityDone}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors',
                activityDone
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {activityDone ? 'Completed' : 'Mark Done'}
            </button>
          )}
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
              onStatusChange={handleStatusChange}
              onInterestChange={handleInterestChange}
            />
          </div>

          {/* Tabbed right column */}
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
            {followUpPrompt && (
              <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-3">
                <span>No answer/voicemail logged. Schedule a follow-up for tomorrow morning?</span>
                <Button size="sm" className="h-7" onClick={scheduleSuggestedFollowUp}>
                  Schedule
                </Button>
              </div>
            )}

            {/* Tab bar — full width, 4 equal tabs, no overflow */}
            <div className="grid shrink-0 border-b border-border bg-card" style={{ gridTemplateColumns: `repeat(${TABS.length}, 1fr)` }}>
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 border-b-2 py-3 text-sm font-medium transition-colors',
                    activeTab === id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                  {id === 'followups' && pendingFollowUps > 0 && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                      {pendingFollowUps}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === 'activity' && (
                <div className="space-y-5">
                  <NoteEditor onSave={handleAddNote} recipients={noteRecipients} />
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
                  onEdit={handleEditFollowUp}
                  onComplete={handleCompleteFollowUp}
                  onDelete={handleDeleteFollowUp}
                />
              )}
              {activeTab === 'calls' && (
                <CallHistory
                  leadId={leadId}
                  calls={data.calls}
                />
              )}
              {activeTab === 'questionnaire' && (
                <Questionnaire
                  leadId={leadId}
                  data={questionnaireData}
                  onSave={handleSaveQuestionnaire}
                  onEmailSnapshot={isAdmin ? (live) => prepareSnapshotEmail({
                    lead_id: data.lead.id,
                    lead: {
                      first_name: data.lead.first_name,
                      last_name:  data.lead.last_name,
                      email:      data.lead.email,
                      phone:      data.lead.phone,
                      company:    data.lead.company,
                      website:    data.lead.website,
                    },
                    answers:   live.answers,
                    questions: live.questions,
                  }) : undefined}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
