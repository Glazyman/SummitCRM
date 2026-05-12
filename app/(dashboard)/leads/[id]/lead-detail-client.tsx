'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Clock, Phone, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LeadActionBar }    from '@/components/leads/detail/lead-action-bar'
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

// ── Tab config ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'activity',      label: 'Activity',      Icon: Activity      },
  { id: 'followups',     label: 'Follow-ups',    Icon: Clock         },
  { id: 'calls',         label: 'Calls',         Icon: Phone         },
  { id: 'questionnaire', label: 'Intake',         Icon: ClipboardList },
] as const

type TabId = typeof TABS[number]['id']
type FollowUpSuggestion = { title: string; notes: string | null; due_at: string }

function tomorrowAt11LocalIso() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(11, 0, 0, 0)
  return d.toISOString()
}

// ── Props ─────────────────────────────────────────────────────────────────
interface LeadDetailClientProps {
  lead:          LeadDetail
  activity:      ActivityEntry[]
  followUps:     FollowUp[]
  calls:         CallLogItem[]
  teamMembers:   TeamMember[]
  currentUserId: string
  isAdmin:       boolean
  canEditBatch:  boolean
}

export default function LeadDetailClient({
  lead:         initialLead,
  activity:     initialActivity,
  followUps:    initialFollowUps,
  calls:        initialCalls,
  teamMembers,
  currentUserId,
  isAdmin,
  canEditBatch,
}: LeadDetailClientProps) {
  const router = useRouter()

  // ── State ──────────────────────────────────────────────────────────────
  const [lead,              setLead]              = React.useState(initialLead)
  const [activity,          setActivity]          = React.useState(initialActivity)
  const [followUps,         setFollowUps]         = React.useState(initialFollowUps)
  const [calls,             setCalls]             = React.useState<CallLogItem[]>(initialCalls)
  const [activeTab,         setActiveTab]         = React.useState<TabId>('activity')
  const [followUpPrompt,    setFollowUpPrompt]    = React.useState<FollowUpSuggestion | null>(null)
  const [questionnaireData, setQuestionnaireData] = React.useState<QuestionnaireData | null>(null)

  // Load questionnaire on mount
  React.useEffect(() => {
    fetch(`/api/leads/${initialLead.id}/questionnaire`)
      .then((r) => r.json())
      .then((d) => { if (d.questionnaire) setQuestionnaireData(d.questionnaire) })
      .catch(() => {})
  }, [initialLead.id])

  async function handleSaveQuestionnaire(qData: QuestionnaireData) {
    await fetch(`/api/leads/${lead.id}/questionnaire`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(qData),
    })
    setQuestionnaireData(qData)
  }

  // ── Lead mutations ───────────────────────────────────────────────────
  async function handleSaveProfile(patch: Partial<LeadDetail>) {
    const previous = lead
    setLead((prev) => ({ ...prev, ...patch }))
    try {
      const data = await requestJson<{ lead: Partial<LeadDetail> }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      setLead((prev) => ({ ...prev, ...data.lead, batch_name: prev.batch_name, assigned_name: prev.assigned_name }))
      router.refresh()
    } catch (err) {
      setLead(previous)
      throw err
    }
  }

  async function handleRenameBatch(name: string) {
    if (!lead.batch_id) return
    await requestJson<{ data: { batch: { id: string; name: string } } }>(`/api/batches/${lead.batch_id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    })
    setLead((l) => ({ ...l, batch_name: name }))
    router.refresh()
  }

  async function handleStatusChange(status: LeadStatus) {
    const prev = lead.status
    if (prev === status) return
    setLead((l) => ({ ...l, status }))
    try {
      const data = await requestJson<{ lead: Partial<LeadDetail>; follow_up_suggestion?: FollowUpSuggestion | null }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setLead((l) => ({ ...l, ...data.lead, batch_name: l.batch_name, assigned_name: l.assigned_name }))
      setFollowUpPrompt(
        data.follow_up_suggestion
          ? { ...data.follow_up_suggestion, due_at: tomorrowAt11LocalIso() }
          : null
      )
      addActivity({ type: 'lead_status_changed', metadata: { from: prev, to: status } })
      router.refresh() // bust leads + pipeline page caches
    } catch (err) {
      setLead((l) => ({ ...l, status: prev }))
      console.error(err)
    }
  }

  async function handleInterestChange(interest_status: import('@/types/database').InterestStatus) {
    const prev = lead.interest_status
    if (prev === interest_status) return
    setLead((l) => ({ ...l, interest_status }))
    try {
      const data = await requestJson<{ lead: Partial<LeadDetail> }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ interest_status }),
      })
      setLead((l) => ({ ...l, ...data.lead, batch_name: l.batch_name, assigned_name: l.assigned_name }))
      router.refresh() // auto-move to pipeline stage is now live
    } catch (err) {
      setLead((l) => ({ ...l, interest_status: prev }))
      console.error(err)
    }
  }

  async function handleAssign(userId: string) {
    const previous = lead
    const member = teamMembers.find((m) => m.id === userId)
    setLead((l) => ({
      ...l,
      assigned_to:   userId || null,
      assigned_name: member?.name ?? null,
    }))
    try {
      const data = await requestJson<{ lead: Partial<LeadDetail> }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_to: userId || null }),
      })
      setLead((l) => ({ ...l, ...data.lead, batch_name: l.batch_name, assigned_name: l.assigned_name }))
      router.refresh() // bust leads page cache so assigned_to shows correctly
    } catch (err) {
      setLead(previous)
      console.error(err)
    }
  }

  async function handleDeleteLead() {
    if (!isAdmin) return
    if (!window.confirm('Delete this lead? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Delete failed')
      }
      router.push('/leads')
      router.refresh()
    } catch (err) {
      console.error(err)
      window.alert('Could not delete lead. Please try again.')
    }
  }

  // ── Note mutations ─────────────────────────────────────────────────────
  async function handleAddNote(content: string, assignedTo: string | null) {
    const data = await requestJson<{ note: { id: string; author_id: string; content: string; created_at: string } }>(
      `/api/leads/${lead.id}/notes`,
      {
        method: 'POST',
        body: JSON.stringify({ content, assigned_to: assignedTo }),
      }
    )
    const newEntry: ActivityEntry = {
      id:           `note-${data.note.id}`,
      source:       'note',
      type:         'note_added',
      user_id:      data.note.author_id,
      user_name:    teamMembers.find((m) => m.id === data.note.author_id)?.name ?? 'You',
      user_initials:initials(teamMembers.find((m) => m.id === data.note.author_id)?.name ?? ''),
      created_at:   data.note.created_at,
      metadata:     {},
      note_id:      data.note.id,
      note_content: data.note.content,
      note_editable:true,
    }
    setActivity((prev) => [newEntry, ...prev])
    setActiveTab('activity')
  }

  async function handleEditNote(noteId: string, content: string) {
    const previous = activity
    setActivity((prev) =>
      prev.map((e) => e.note_id === noteId ? { ...e, note_content: content } : e)
    )
    try {
      const data = await requestJson<{ note: { content: string } }>(`/api/leads/${lead.id}/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      setActivity((prev) =>
        prev.map((e) => e.note_id === noteId ? { ...e, note_content: data.note.content } : e)
      )
    } catch (err) {
      setActivity(previous)
      console.error(err)
    }
  }

  async function handleDeleteNote(noteId: string) {
    // Capture the entry being removed so we can splice it back on failure,
    // without clobbering any state changes (e.g. status entries) added concurrently.
    let removed: ActivityEntry | undefined
    let removedIndex = -1
    setActivity((prev) => {
      removedIndex = prev.findIndex((e) => e.note_id === noteId)
      removed = prev[removedIndex]
      return prev.filter((e) => e.note_id !== noteId)
    })
    try {
      await requestJson<{ success: boolean }>(`/api/leads/${lead.id}/notes/${noteId}`, {
        method: 'DELETE',
      })
    } catch (err) {
      // Targeted restore: splice the note back at its original position
      if (removed) {
        setActivity((prev) => {
          const idx = removedIndex >= 0 ? Math.min(removedIndex, prev.length) : prev.length
          return [...prev.slice(0, idx), removed!, ...prev.slice(idx)]
        })
      }
      console.error(err)
    }
  }

  async function handleDeleteActivity(activityId: string) {
    const removed = activity.find((e) => e.id === activityId)
    let removedIndex = -1
    setActivity((prev) => {
      removedIndex = prev.findIndex((e) => e.id === activityId)
      return prev.filter((e) => e.id !== activityId)
    })
    // Optimistic-only rows (never inserted into activity_logs)
    if (activityId.startsWith('act-')) return
    if (!removed) return

    try {
      await requestJson<{ success: boolean }>(`/api/leads/${lead.id}/activity/${activityId}`, {
        method: 'DELETE',
      })
    } catch (err) {
      console.error('Could not delete activity entry', err)
      setActivity((prev) => {
        const idx = removedIndex >= 0 ? Math.min(removedIndex, prev.length) : prev.length
        return [...prev.slice(0, idx), removed, ...prev.slice(idx)]
      })
    }
  }

  // ── Follow-up mutations ────────────────────────────────────────────────
  async function handleAddFollowUp(data: NewFollowUp) {
    const result = await requestJson<{ follow_up: Omit<FollowUp, 'is_completed' | 'assigned_name'> }>(
      `/api/leads/${lead.id}/follow-ups`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
    const member = teamMembers.find((m) => m.id === result.follow_up.assigned_to)
    const newFU: FollowUp = {
      ...result.follow_up,
      is_completed:  Boolean(result.follow_up.completed_at),
      assigned_name: member?.name ?? null,
    }
    setFollowUps((prev) => [newFU, ...prev])
    addActivity({
      type:     'follow_up_scheduled',
      metadata: { title: newFU.title, due_at: newFU.due_at },
    })
  }

  async function handleCompleteFollowUp(id: string) {
    const previous = followUps
    const completedAt = new Date().toISOString()
    const followUp = followUps.find((f) => f.id === id)
    setFollowUps((prev) => {
      return prev.map((f) =>
        f.id === id
          ? { ...f, is_completed: true, completed_at: completedAt }
          : f
      )
    })
    try {
      const data = await requestJson<{ follow_up: Omit<FollowUp, 'is_completed' | 'assigned_name'> }>(
        `/api/leads/${lead.id}/follow-ups/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ completed_at: completedAt }),
        }
      )
      setFollowUps((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, ...data.follow_up, is_completed: Boolean(data.follow_up.completed_at) }
            : f
        )
      )
      if (followUp) addActivity({ type: 'follow_up_completed', metadata: { title: followUp.title } })
    } catch (err) {
      setFollowUps(previous)
      console.error(err)
    }
  }

  async function handleDeleteFollowUp(id: string) {
    const previous = followUps
    setFollowUps((prev) => prev.filter((f) => f.id !== id))
    try {
      await requestJson<{ success: boolean }>(`/api/leads/${lead.id}/follow-ups/${id}`, {
        method: 'DELETE',
      })
    } catch (err) {
      setFollowUps(previous)
      console.error(err)
    }
  }

  async function handleEditFollowUp(id: string, data: { title: string; notes: string; due_at: string; assigned_to: string }) {
    const res = await requestJson<{ follow_up: FollowUp }>(`/api/leads/${lead.id}/follow-ups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    if (res.follow_up) {
      const member = teamMembers.find((m) => m.id === res.follow_up.assigned_to)
      setFollowUps((prev) => prev.map((f) =>
        f.id === id ? { ...f, ...res.follow_up, assigned_name: member?.name ?? f.assigned_name } : f
      ))
    }
  }

  async function scheduleSuggestedFollowUp() {
    if (!followUpPrompt) return
    const result = await requestJson<{ follow_up: Omit<FollowUp, 'is_completed' | 'assigned_name'> }>(
      `/api/leads/${lead.id}/follow-ups`,
      {
        method: 'POST',
        body: JSON.stringify(followUpPrompt),
      }
    )
    const member = teamMembers.find((m) => m.id === result.follow_up.assigned_to)
    const newFU: FollowUp = {
      ...result.follow_up,
      is_completed:  Boolean(result.follow_up.completed_at),
      assigned_name: member?.name ?? null,
    }
    setFollowUps((prev) => [newFU, ...prev])
    setFollowUpPrompt(null)
    setActiveTab('followups')
    addActivity({ type: 'follow_up_scheduled', metadata: { title: newFU.title, due_at: newFU.due_at } })
  }

  // ── Utility ───────────────────────────────────────────────────────────
  function addActivity(partial: Pick<ActivityEntry, 'type' | 'metadata'>) {
    const currentUser = teamMembers.find((m) => m.id === currentUserId)
    const entry: ActivityEntry = {
      id:            `act-${Date.now()}`,
      source:        'activity',
      user_id:       currentUserId,
      user_name:     currentUser?.name ?? null,
      user_initials: initials(currentUser?.name ?? ''),
      created_at:    new Date().toISOString(),
      ...partial,
    }
    setActivity((prev) => [entry, ...prev])
  }


  // ── Pending count badges ──────────────────────────────────────────────
  const pendingFollowUps = followUps.filter((f) => !f.is_completed).length

  return (
    <div className="flex min-h-screen flex-col">

      {/* Sticky top action bar */}
      <LeadActionBar
        lead={lead}
        teamMembers={teamMembers}
        isAdmin={isAdmin}
        onStatusChange={handleStatusChange}
        onInterestChange={handleInterestChange}
        onAssign={handleAssign}
        onDelete={handleDeleteLead}
        onDoNotContact={() => handleStatusChange('do_not_contact')}
      />

      {followUpPrompt && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>Status updated to no answer/voicemail. Schedule a follow-up for tomorrow morning?</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={scheduleSuggestedFollowUp} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                Schedule
              </button>
              <button type="button" onClick={() => setFollowUpPrompt(null)} className="rounded-md px-2 py-1.5 text-xs text-amber-900 hover:bg-amber-100">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-column desktop layout ─────────────────────────────────── */}
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

          {/* ── Left: Profile card (sticky on lg) ── */}
          <div className="lg:sticky lg:top-[121px] lg:w-80 xl:w-96 shrink-0">
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

          {/* ── Right: Tabbed content ── */}
          <div className="min-w-0 flex-1 space-y-6">

            {/* Mobile tab bar */}
            <div className="flex overflow-x-auto border-b border-border scrollbar-hide lg:hidden">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    activeTab === id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {id === 'followups' && pendingFollowUps > 0 && (
                    <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                      {pendingFollowUps}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Activity + Notes (always visible on desktop) ── */}
            <Section
              title="Activity"
              icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              visible={activeTab === 'activity'}
              alwaysVisible
            >
              {/* Note editor —
                  · reps   → can ping admins only
                  · admins → can ping other admins + the rep currently
                              assigned to this lead (not other reps)
              */}
              <div className="mb-6">
                <NoteEditor
                  onSave={handleAddNote}
                  recipients={(() => {
                    const me = teamMembers.find((m) => m.id === currentUserId)
                    const isCurrentRep = me?.role === 'rep' || !isAdmin
                    const leadOwnerId  = lead.assigned_to
                    return teamMembers
                      .filter((m) => m.id !== currentUserId)
                      .filter((m) => {
                        const isMemberAdmin = m.role === 'admin' || m.role === 'super_admin'
                        if (isCurrentRep) return isMemberAdmin
                        return isMemberAdmin || m.id === leadOwnerId
                      })
                      .map((m) => ({ id: m.id, name: m.name, role: m.role }))
                  })()}
                />
              </div>

              <ActivityTimeline
                entries={activity}
                onEditNote={handleEditNote}
                onDeleteNote={handleDeleteNote}
                onDeleteActivity={handleDeleteActivity}
              />
            </Section>

            {/* ── Follow-ups ── */}
            <Section
              title="Follow-ups"
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              count={pendingFollowUps || undefined}
              countColor="orange"
              visible={activeTab === 'followups'}
              alwaysVisible
            >
              <FollowUpSection
                followUps={followUps}
                teamMembers={teamMembers}
                currentUserId={currentUserId}
                onAdd={handleAddFollowUp}
                onEdit={handleEditFollowUp}
                onComplete={handleCompleteFollowUp}
                onDelete={handleDeleteFollowUp}
              />
            </Section>

            {/* ── Call History ── */}
            <Section
              title="Calls"
              icon={<Phone className="h-4 w-4 text-muted-foreground" />}
              count={calls.length || undefined}
              visible={activeTab === 'calls'}
              alwaysVisible
            >
              <CallHistory
                leadId={lead.id}
                calls={calls}
              />
            </Section>

            <Section
              title="Questionnaire"
              icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
              visible={activeTab === 'questionnaire'}
              alwaysVisible
            >
              <Questionnaire
                leadId={lead.id}
                data={questionnaireData}
                onSave={handleSaveQuestionnaire}
                onEmailSnapshot={isAdmin ? (live) => prepareSnapshotEmail({
                  lead_id: lead.id,
                  lead: {
                    first_name: lead.first_name,
                    last_name:  lead.last_name,
                    email:      lead.email,
                    phone:      lead.phone,
                    company:    lead.company,
                    website:    lead.website,
                  },
                  answers:   live.answers,
                  questions: live.questions,
                }) : undefined}
              />
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────
function Section({
  title,
  icon,
  count,
  countColor = 'default',
  children,
  visible,
  alwaysVisible,
}: {
  title:         string
  icon?:         React.ReactNode
  count?:        number
  countColor?:   'default' | 'orange'
  children:      React.ReactNode
  visible:       boolean
  alwaysVisible: boolean
}) {
  return (
    <div className={cn(
      'rounded-2xl border border-border bg-card',
      // On mobile: show only active section; on desktop: always show all
      visible ? 'block' : 'hidden',
      alwaysVisible && 'lg:block'
    )}>
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className={cn(
            'ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-primary-foreground',
            countColor === 'orange' ? 'bg-secondary' : 'bg-primary'
          )}>
            {count}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────
function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(payload?.error ?? 'Request failed')
  }
  return payload as T
}
