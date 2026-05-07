'use client'

import * as React from 'react'
import { Mail, Activity, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LeadActionBar }    from '@/components/leads/detail/lead-action-bar'
import { LeadProfileCard }  from '@/components/leads/detail/lead-profile-card'
import { ActivityTimeline } from '@/components/leads/detail/activity-timeline'
import { NoteEditor }       from '@/components/leads/detail/note-editor'
import { EmailHistory }     from '@/components/leads/detail/email-history'
import { FollowUpSection }  from '@/components/leads/detail/follow-up-section'
import { EmailPanel }       from '@/components/email/email-panel'
import { AIDraftModal }     from '@/components/ai'
import type {
  LeadDetail, ActivityEntry, EmailHistoryItem,
  FollowUp, NewFollowUp, TeamMember, LeadStatus,
} from '@/components/leads/detail/types'
import type { SendingAccountPublic, QuotaStatus } from '@/lib/email/types'

// ── Mock sending accounts (replace with real API fetch) ───────────────────
const MOCK_ACCOUNTS: SendingAccountPublic[] = [
  {
    id:              'acct-1',
    workspace_id:    'ws-1',
    name:            'Primary outreach',
    from_name:       'Alex from Summits',
    from_email:      'alex@summits.io',
    type:            'resend',
    is_active:       true,
    daily_limit:     50,
    emails_sent_today: 12,
    quota_remaining: 38,
    quota_percent:   24,
    quota_reset_at:  null,
    last_error:      null,
    last_tested_at:  null,
    created_at:      '2025-01-01T00:00:00Z',
    smtp_host:       null,
    smtp_port:       null,
    smtp_user:       null,
    smtp_secure:     false,
  },
  {
    id:              'acct-2',
    workspace_id:    'ws-1',
    name:            'Follow-up account',
    from_name:       'Support — Summits',
    from_email:      'support@summits.io',
    type:            'smtp',
    is_active:       true,
    daily_limit:     50,
    emails_sent_today: 44,
    quota_remaining: 6,
    quota_percent:   88,
    quota_reset_at:  null,
    last_error:      null,
    last_tested_at:  null,
    created_at:      '2025-01-01T00:00:00Z',
    smtp_host:       'smtp.example.com',
    smtp_port:       587,
    smtp_user:       'support@summits.io',
    smtp_secure:     false,
  },
]

const MOCK_QUOTAS: Record<string, QuotaStatus> = {
  'acct-1': { account_id: 'acct-1', account_name: 'Primary outreach',   daily_limit: 50, sent_today: 12, remaining: 38, percent_used: 24, at_limit: false, reset_at: null },
  'acct-2': { account_id: 'acct-2', account_name: 'Follow-up account',  daily_limit: 50, sent_today: 44, remaining: 6,  percent_used: 88, at_limit: false, reset_at: null },
}

// ── Tab config ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'activity',  label: 'Activity',   Icon: Activity    },
  { id: 'emails',    label: 'Emails',     Icon: Mail        },
  { id: 'followups', label: 'Follow-ups', Icon: Clock       },
] as const

type TabId = typeof TABS[number]['id']

// ── Props ─────────────────────────────────────────────────────────────────
interface LeadDetailClientProps {
  lead:         LeadDetail
  activity:     ActivityEntry[]
  emails:       EmailHistoryItem[]
  followUps:    FollowUp[]
  teamMembers:  TeamMember[]
  currentUserId:string
  isAdmin:      boolean
}

export default function LeadDetailClient({
  lead:         initialLead,
  activity:     initialActivity,
  emails:       initialEmails,
  followUps:    initialFollowUps,
  teamMembers,
  currentUserId,
  isAdmin,
}: LeadDetailClientProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [lead,          setLead]         = React.useState(initialLead)
  const [activity,      setActivity]     = React.useState(initialActivity)
  const [emails,        setEmails]       = React.useState(initialEmails)
  const [followUps,     setFollowUps]    = React.useState(initialFollowUps)
  const [activeTab,     setActiveTab]    = React.useState<TabId>('activity')
  const [emailPanelOpen,   setEmailPanelOpen]   = React.useState(false)
  const [aiDraftOpen,      setAiDraftOpen]      = React.useState(false)
  const [pendingAiDraft,   setPendingAiDraft]   = React.useState<{ subject: string; body_html: string; body_text: string } | null>(null)

  // ── Lead mutations (optimistic, swap real calls in once backend ready) ─
  async function handleSaveProfile(patch: Partial<LeadDetail>) {
    setLead((prev) => ({ ...prev, ...patch }))
    // TODO: await fetch(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }

  function handleStatusChange(status: LeadStatus) {
    const prev = lead.status
    setLead((l) => ({ ...l, status }))
    addActivity({
      type:     'lead_status_changed',
      metadata: { from: prev, to: status },
    })
    // TODO: PATCH /api/leads/[id]
  }

  function handleAssign(userId: string) {
    const member = teamMembers.find((m) => m.id === userId)
    setLead((l) => ({
      ...l,
      assigned_to:   userId || null,
      assigned_name: member?.name ?? null,
    }))
    // TODO: PATCH /api/leads/[id]
  }

  // ── Note mutations ─────────────────────────────────────────────────────
  async function handleAddNote(content: string) {
    const newEntry: ActivityEntry = {
      id:           `note-${Date.now()}`,
      source:       'note',
      type:         'note_added',
      user_id:      currentUserId,
      user_name:    teamMembers.find((m) => m.id === currentUserId)?.name ?? 'You',
      user_initials:initials(teamMembers.find((m) => m.id === currentUserId)?.name ?? ''),
      created_at:   new Date().toISOString(),
      metadata:     {},
      note_id:      `note-${Date.now()}`,
      note_content: content,
      note_editable:true,
    }
    setActivity((prev) => [newEntry, ...prev])
    setActiveTab('activity')
    // TODO: POST /api/leads/[id]/notes
  }

  function handleEditNote(noteId: string, content: string) {
    setActivity((prev) =>
      prev.map((e) => e.note_id === noteId ? { ...e, note_content: content } : e)
    )
    // TODO: PATCH /api/leads/[id]/notes/[noteId]
  }

  function handleDeleteNote(noteId: string) {
    setActivity((prev) => prev.filter((e) => e.note_id !== noteId))
    // TODO: DELETE /api/leads/[id]/notes/[noteId]
  }

  // ── Follow-up mutations ────────────────────────────────────────────────
  async function handleAddFollowUp(data: NewFollowUp) {
    const member = teamMembers.find((m) => m.id === data.assigned_to)
    const newFU: FollowUp = {
      id:            `fu-${Date.now()}`,
      title:         data.title,
      notes:         data.notes || null,
      due_at:        data.due_at,
      is_completed:  false,
      completed_at:  null,
      assigned_to:   data.assigned_to || null,
      assigned_name: member?.name ?? null,
    }
    setFollowUps((prev) => [newFU, ...prev])
    addActivity({
      type:     'follow_up_scheduled',
      metadata: { title: data.title, due_at: data.due_at },
    })
    // TODO: POST /api/leads/[id]/follow-ups
  }

  function handleCompleteFollowUp(id: string) {
    // Use functional update to avoid stale closure — read current list inside setter
    setFollowUps((prev) => {
      const fu = prev.find((f) => f.id === id)
      if (fu) {
        addActivity({ type: 'follow_up_completed', metadata: { title: fu.title } })
      }
      return prev.map((f) =>
        f.id === id
          ? { ...f, is_completed: true, completed_at: new Date().toISOString() }
          : f
      )
    })
    // TODO: PATCH /api/leads/[id]/follow-ups/[id]
  }

  function handleDeleteFollowUp(id: string) {
    setFollowUps((prev) => prev.filter((f) => f.id !== id))
    // TODO: DELETE /api/leads/[id]/follow-ups/[id]
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

  // ── Apply AI draft to email panel when it opens ───────────────────────
  React.useEffect(() => {
    if (emailPanelOpen && pendingAiDraft) {
      // pendingAiDraft will be read by EmailPanel via initialDraft prop
      // Clear it after a tick so it's consumed once
      const id = setTimeout(() => setPendingAiDraft(null), 100)
      return () => clearTimeout(id)
    }
  }, [emailPanelOpen, pendingAiDraft])

  // ── Email sent handler ────────────────────────────────────────────────
  function handleEmailSent(emailId: string) {
    // Optimistic: add a stub to the email list so history refreshes
    const newItem: EmailHistoryItem = {
      id:          emailId,
      subject:     '(sending…)',
      sent_at:     new Date().toISOString(),
      status:      'sending',
      sender_name: MOCK_ACCOUNTS[0]?.from_name ?? null,
      body_html:   null,
      opened_at:   null,
      clicked_at:  null,
      replied_at:  null,
      bounced_at:  null,
    }
    setEmails((prev) => [newItem, ...prev])
    addActivity({ type: 'email_sent', metadata: { subject: '(sending…)' } })
    setActiveTab('emails')
  }

  return (
    <div className="flex min-h-screen flex-col">

      {/* AI Draft Modal */}
      <AIDraftModal
        open={aiDraftOpen}
        onClose={() => setAiDraftOpen(false)}
        leadId={lead.id}
        sendingAccountId={MOCK_ACCOUNTS[0]?.id ?? ''}
        leadName={[lead.first_name, lead.last_name].filter(Boolean).join(' ')}
        onUse={(draft) => {
          setPendingAiDraft(draft)
          setAiDraftOpen(false)
          setEmailPanelOpen(true)
        }}
      />

      {/* Right-side email panel (slide-in) */}
      <EmailPanel
        open={emailPanelOpen}
        onClose={() => setEmailPanelOpen(false)}
        lead={{
          id:         lead.id,
          email:      lead.email,
          first_name: lead.first_name,
          last_name:  lead.last_name,
          company:    lead.company,
          title:      lead.title,
        }}
        accounts={MOCK_ACCOUNTS}
        quotas={MOCK_QUOTAS}
        emails={emails}
        onSent={handleEmailSent}
        initialSubject={pendingAiDraft?.subject}
        initialBody={pendingAiDraft?.body_html}
      />

      {/* Sticky top action bar */}
      <LeadActionBar
        lead={lead}
        teamMembers={teamMembers}
        isAdmin={isAdmin}
        onStatusChange={handleStatusChange}
        onAssign={handleAssign}
        onSendEmail={() => setEmailPanelOpen(true)}
        onAIDraft={() => setAiDraftOpen(true)}
        onDelete={() => {/* TODO: soft delete + navigate away */}}
        onDoNotContact={() => handleStatusChange('do_not_contact')}
      />

      {/* ── Two-column desktop layout ─────────────────────────────────── */}
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

          {/* ── Left: Profile card (sticky on lg) ── */}
          <div className="lg:sticky lg:top-[121px] lg:w-80 xl:w-96 shrink-0">
            <LeadProfileCard
              lead={lead}
              teamMembers={teamMembers}
              onSave={handleSaveProfile}
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
                    <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white">
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
              {/* Note editor */}
              <div className="mb-6">
                <NoteEditor onSave={handleAddNote} />
              </div>

              <ActivityTimeline
                entries={activity}
                onEditNote={handleEditNote}
                onDeleteNote={handleDeleteNote}
              />
            </Section>

            {/* ── Email History ── */}
            <Section
              title="Email History"
              icon={<Mail className="h-4 w-4 text-muted-foreground" />}
              count={emails.length}
              visible={activeTab === 'emails'}
              alwaysVisible
            >
              <EmailHistory emails={emails} />
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
                onComplete={handleCompleteFollowUp}
                onDelete={handleDeleteFollowUp}
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
            'ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white',
            countColor === 'orange' ? 'bg-orange-500' : 'bg-primary'
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
