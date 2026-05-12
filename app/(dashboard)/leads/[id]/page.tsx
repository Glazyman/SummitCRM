import { Suspense }      from 'react'
import { notFound }      from 'next/navigation'
import { Spinner }       from '@/components/ui/spinner'
import LeadDetailClient  from './lead-detail-client'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getUsersById } from '@/lib/users'
import type { ActivityEntry, EmailHistoryItem, FollowUp, LeadDetail, TeamMember } from '@/components/leads/detail/types'
/* eslint-disable @typescript-eslint/no-explicit-any */

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params

  const supabase = (await createClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

  const workspaceId = member?.workspace_id
  if (!workspaceId) notFound()

  const [leadResult, batchesResult, activityResult, notesResult, emailsResult, followUpsResult, callsResult, membersResult] = await Promise.all([
    supabase
      .from('leads')
      .select('id, workspace_id, first_name, last_name, email, phone, title, company, website, linkedin_url, status, interest_status, is_unsubscribed, batch_id, assigned_to, ai_summary, custom_fields, created_at, updated_at')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .single(),
    supabase.from('lead_batches').select('id, name').eq('workspace_id', workspaceId),
    supabase.from('activity_logs').select('id, lead_id, user_id, type, metadata, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('notes').select('id, lead_id, author_id, content, created_at, updated_at').eq('lead_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('emails').select('id, subject, body_html, sent_by, status, sent_at, opened_at, clicked_at, replied_at, bounced_at, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('follow_ups').select('id, title, notes, due_at, completed_at, assigned_to').eq('lead_id', id).order('due_at', { ascending: true }),
    supabase.from('call_logs').select('id, outcome, duration_sec, notes, called_at, logged_by').eq('lead_id', id).order('called_at', { ascending: false }),
    supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('is_active', true),
  ])

  if (!leadResult.data) notFound()

  const memberIds = ((membersResult.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
  const adminClient = createAdminClient()
  const usersById = await getUsersById(adminClient, workspaceId, memberIds)

  const batchNames = new Map(((batchesResult.data ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]))
  const rawLead = leadResult.data as {
    id: string
    workspace_id: string
    first_name: string | null
    last_name: string | null
    email: string
    phone: string | null
    title: string | null
    company: string | null
    website: string | null
    linkedin_url: string | null
    status: LeadDetail['status']
    interest_status: LeadDetail['interest_status']
    is_unsubscribed: boolean
    batch_id: string | null
    assigned_to: string | null
    ai_summary: string | null
    custom_fields: Record<string, string> | null
    created_at: string
    updated_at: string
  }

  const lead: LeadDetail = {
    ...rawLead,
    interest_status: rawLead.interest_status ?? 'pending',
    batch_name: rawLead.batch_id ? batchNames.get(rawLead.batch_id) ?? null : null,
    assigned_name: rawLead.assigned_to ? usersById.get(rawLead.assigned_to) ?? null : null,
    assigned_avatar: null,
    custom_fields: rawLead.custom_fields ?? {},
  }

  const currentUserId = user.id
  const isAdmin = ['super_admin', 'admin'].includes(member?.role ?? '')
  const canEditBatch = ['admin', 'super_admin'].includes(member?.role ?? '')
  const teamMembers: TeamMember[] = memberIds.map((userId) => ({ id: userId, name: usersById.get(userId) ?? userId }))

  const activity: ActivityEntry[] = ((activityResult.data ?? []) as Array<{
    id: string
    user_id: string | null
    type: ActivityEntry['type']
    metadata: Record<string, unknown>
    created_at: string
  }>).map((entry) => ({
    id: entry.id,
    source: 'activity',
    type: entry.type,
    user_id: entry.user_id,
    user_name: entry.user_id ? usersById.get(entry.user_id) ?? null : null,
    user_initials: null,
    created_at: entry.created_at,
    metadata: entry.metadata ?? {},
  }))

  const notes: ActivityEntry[] = ((notesResult.data ?? []) as Array<{
    id: string
    author_id: string
    content: string
    created_at: string
  }>).map((note) => ({
    id: `note-${note.id}`,
    source: 'note',
    type: 'note_added',
    user_id: note.author_id,
    user_name: usersById.get(note.author_id) ?? null,
    user_initials: null,
    created_at: note.created_at,
    metadata: {},
    note_id: note.id,
    note_content: note.content,
    note_editable: note.author_id === currentUserId || isAdmin,
  }))

  const emails: EmailHistoryItem[] = ((emailsResult.data ?? []) as Array<{
    id: string
    subject: string
    body_html: string | null
    sent_by: string | null
    status: EmailHistoryItem['status']
    sent_at: string | null
    opened_at: string | null
    clicked_at: string | null
    replied_at: string | null
    bounced_at: string | null
  }>).map((email) => ({
    ...email,
    sender_name: email.sent_by ? usersById.get(email.sent_by) ?? null : null,
  }))

  const followUps: FollowUp[] = ((followUpsResult.data ?? []) as Array<{
    id: string
    title: string
    notes: string | null
    due_at: string
    completed_at: string | null
    assigned_to: string | null
  }>).map((followUp) => ({
    ...followUp,
    is_completed: Boolean(followUp.completed_at),
    assigned_name: followUp.assigned_to ? usersById.get(followUp.assigned_to) ?? null : null,
  }))

  const calls = ((callsResult.data ?? []) as Array<{
    id: string
    outcome: string
    duration_sec: number | null
    notes: string | null
    called_at: string
    logged_by: string
  }>).map((c) => ({
    ...c,
    outcome: c.outcome as import('@/components/leads/detail/call-history').CallLogItem['outcome'],
    logger_name: usersById.get(c.logged_by) ?? null,
  }))

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      }
    >
      <LeadDetailClient
        lead={lead}
        activity={[...activity, ...notes].sort((a, b) => b.created_at.localeCompare(a.created_at))}

        followUps={followUps}
        calls={calls}
        teamMembers={teamMembers}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        canEditBatch={canEditBatch}
      />
    </Suspense>
  )
}

// Generate metadata
export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  return {
    title: `Lead ${id} · Lead Detail`,
  }
}
