import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { getUsersById } from '@/lib/users'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase = (await createServerClient(cookieStore)) as unknown as ReturnType<typeof createAdminClient>

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const workspaceId = member.workspace_id
    const isAdmin = ['super_admin', 'admin'].includes(member.role)
    const currentUserId = user.id

    const [leadRes, batchesRes, activityRes, notesRes, emailsRes, followUpsRes, callsRes, membersRes, tagsRes, allTagsRes] = await Promise.all([
      supabase
        .from('leads')
        .select('id, workspace_id, first_name, last_name, email, phone, title, company, website, linkedin_url, status, interest_status, is_unsubscribed, batch_id, assigned_to, ai_summary, custom_fields, created_at, updated_at')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .single(),
      supabase.from('lead_batches').select('id, name').eq('workspace_id', workspaceId),
      supabase.from('activity_logs').select('id, user_id, type, metadata, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
      supabase.from('notes').select('id, author_id, content, assigned_to, created_at, updated_at').eq('lead_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('emails').select('id, subject, body_html, sent_by, status, sent_at, opened_at, clicked_at, replied_at, bounced_at, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
      supabase.from('follow_ups').select('id, title, notes, due_at, completed_at, assigned_to').eq('lead_id', id).order('due_at', { ascending: true }),
      supabase.from('call_logs').select('id, outcome, duration_sec, notes, called_at, logged_by').eq('lead_id', id).order('called_at', { ascending: false }),
      supabase.from('workspace_members').select('user_id, role').eq('workspace_id', workspaceId).eq('is_active', true),
      supabase.from('lead_tags').select('tags(id, name, color)').eq('lead_id', id),
      supabase.from('tags').select('id, name, color').eq('workspace_id', workspaceId).order('name'),
    ])

    if (!leadRes.data) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Reps can only open leads assigned to them (same rule as GET /api/leads/[id]
    // and the calls route — this was the one lead read missing the check).
    if (member.role === 'rep' && (leadRes.data as { assigned_to: string | null }).assigned_to !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Resolve user names via workspace-scoped SQL RPC.
    const memberRows = (membersRes.data ?? []) as Array<{ user_id: string; role: string }>
    const memberIds  = memberRows.map((m) => m.user_id)
    const roleById   = new Map(memberRows.map((m) => [m.user_id, m.role]))
    const adminClient = createAdminClient()
    const usersById = await getUsersById(adminClient, workspaceId, memberIds)

    const batchNames = new Map(
      ((batchesRes.data ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name])
    )

    const rawLead = leadRes.data as Record<string, unknown>
    const lead = {
      ...rawLead,
      interest_status: (rawLead.interest_status as string | null) ?? 'pending',
      batch_name: rawLead.batch_id ? batchNames.get(rawLead.batch_id as string) ?? null : null,
      assigned_name: rawLead.assigned_to ? usersById.get(rawLead.assigned_to as string) ?? null : null,
      assigned_avatar: null,
      custom_fields: (rawLead.custom_fields as Record<string, string> | null) ?? {},
    }

    const activityEntries = ((activityRes.data ?? []) as Array<{ id: string; user_id: string | null; type: string; metadata: Record<string, unknown>; created_at: string }>)
      .map((e) => ({
        id:            e.id,
        source:        'activity' as const,
        type:          e.type,
        user_id:       e.user_id,
        user_name:     e.user_id ? (usersById.get(e.user_id) ?? null) : null,
        user_initials: null,
        created_at:    e.created_at,
        metadata:      e.metadata ?? {},
      }))

    const noteEntries = ((notesRes.data ?? []) as Array<{ id: string; author_id: string; content: string; assigned_to: string | null; created_at: string }>)
      .map((n) => ({
        id:                    `note-${n.id}`,
        source:                'note' as const,
        type:                  'note_added' as const,
        user_id:               n.author_id,
        user_name:             usersById.get(n.author_id) ?? null,
        user_initials:         null,
        created_at:            n.created_at,
        metadata:              {},
        note_id:               n.id,
        note_content:          n.content,
        note_editable:         n.author_id === currentUserId || isAdmin,
        note_assigned_to:      n.assigned_to,
        note_assigned_to_name: n.assigned_to ? (usersById.get(n.assigned_to) ?? null) : null,
      }))

    const activity = [...activityEntries, ...noteEntries].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    )

    const emails = ((emailsRes.data ?? []) as Array<{
      id: string; subject: string; body_html: string | null; sent_by: string | null;
      status: string; sent_at: string | null; opened_at: string | null;
      clicked_at: string | null; replied_at: string | null; bounced_at: string | null; created_at: string
    }>).map((e) => ({ ...e, sender_name: e.sent_by ? (usersById.get(e.sent_by) ?? null) : null }))

    const followUps = ((followUpsRes.data ?? []) as Array<{
      id: string; title: string; notes: string | null; due_at: string;
      completed_at: string | null; assigned_to: string | null
    }>).map((f) => ({
      ...f,
      is_completed:  Boolean(f.completed_at),
      assigned_name: f.assigned_to ? (usersById.get(f.assigned_to) ?? null) : null,
    }))

    const calls = ((callsRes.data ?? []) as Array<{
      id: string; outcome: string; duration_sec: number | null;
      notes: string | null; called_at: string; logged_by: string
    }>).map((c) => ({ ...c, logger_name: usersById.get(c.logged_by) ?? null }))

    const teamMembers = memberIds.map((uid) => ({
      id:   uid,
      name: usersById.get(uid) ?? uid,
      role: roleById.get(uid),
    }))

    // Lead's current tags (flatten the lead_tags → tags embed) + the workspace's
    // full tag list so the picker can offer past tags for reuse.
    type TagRow = { id: string; name: string; color: string }
    const tags = ((tagsRes.data ?? []) as Array<{ tags: TagRow | TagRow[] | null }>)
      .flatMap((r) => (Array.isArray(r.tags) ? r.tags : r.tags ? [r.tags] : []))
    const availableTags = (allTagsRes.data ?? []) as TagRow[]

    return NextResponse.json({ lead, activity, emails, followUps, calls, teamMembers, tags, availableTags, currentUserId, isAdmin })
  } catch (err) {
    console.error('[GET /api/leads/[id]/full]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
