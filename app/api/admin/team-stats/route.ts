/**
 * GET /api/admin/team-stats
 * Per-rep email performance for date range.
 * Required: admin+ (managers see read-only, admins see all)
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

function dateRange(preset: string | null, customStart?: string | null, customEnd?: string | null) {
  const now = new Date()
  let start = new Date(now)
  let end   = new Date(now)

  if (customStart && customEnd) {
    return { start: customStart, end: customEnd }
  }
  if (preset === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (preset === '7d') {
    start.setDate(start.getDate() - 7)
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  } else {
    start.setDate(start.getDate() - 30)
  }
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = createAdminClient()
    const { data: member } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Manager or admin role required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const range = dateRange(
      searchParams.get('range'),
      searchParams.get('start'),
      searchParams.get('end'),
    )

    const wsId = member.workspace_id

    // Load all active members + their emails in the period
    const [membersRes, emailsRes, leadsAssignedRes] = await Promise.all([
      adminClient
        .from('workspace_members')
        .select('user_id, role, users:user_id(email, raw_user_meta_data)')
        .eq('workspace_id', wsId)
        .eq('is_active', true),

      adminClient
        .from('emails')
        .select('sent_by, status, created_at')
        .eq('workspace_id', wsId)
        .gte('created_at', range.start)
        .lte('created_at', range.end),

      // RPC aggregate — bypasses PostgREST row limit
      adminClient.rpc('get_leads_assigned_status_counts', { p_workspace_id: wsId }),
    ]) as [
      { data: Array<{ user_id: string; role: string; users: { email: string; raw_user_meta_data: Record<string, unknown> } | null }> | null },
      { data: Array<{ sent_by: string | null; status: string; created_at: string }> | null },
      { data: Array<{ assigned_to: string }> | null }
    ]

    // Calls per rep: call logs + legacy fallback from bulk status changes
    let callRows: Array<{ user_id: string }> = []
    try {
      const [callLogsRes, statusActivitiesRes] = await Promise.all([
        adminClient
          .from('call_logs')
          .select('logged_by')
          .eq('workspace_id', wsId)
          .gte('called_at', range.start)
          .lte('called_at', range.end),
        adminClient
          .from('activity_logs')
          .select('user_id, metadata')
          .eq('workspace_id', wsId)
          .eq('type', 'lead_status_changed')
          .gte('created_at', range.start)
          .lte('created_at', range.end),
      ])

      callRows = ((callLogsRes.data ?? []) as Array<{ logged_by: string | null }>)
        .filter((r) => !!r.logged_by)
        .map((r) => ({ user_id: r.logged_by as string }))

      const statusToCall = new Set(['called', 'voicemail', 'no_answer', 'wrong_number', 'sold_already'])
      const syntheticRows = ((statusActivitiesRes.data ?? []) as Array<{ user_id: string; metadata: Record<string, unknown> | null }>)
        .filter((r) => !!r.user_id)
        .filter((r) => r.metadata?.bulk === true)
        .filter((r) => typeof r.metadata?.to === 'string' && statusToCall.has(r.metadata.to as string))
        .map((r) => ({ user_id: r.user_id }))

      callRows = [...callRows, ...syntheticRows]
    } catch {}

    const members   = membersRes.data ?? []
    const emails    = emailsRes.data  ?? []
    // RPC returns [{assigned_to, status, cnt}] — sum counts per user
    const leadCounts = (leadsAssignedRes.data ?? []) as Array<{ assigned_to: string | null; status: string; cnt: number }>

    // Count leads assigned per user (sum across all statuses)
    const leadsByUser = new Map<string, number>()
    for (const row of leadCounts) {
      if (row.assigned_to) {
        leadsByUser.set(row.assigned_to, (leadsByUser.get(row.assigned_to) ?? 0) + Number(row.cnt))
      }
    }

    // Count calls per user
    const callsByUser = new Map<string, number>()
    for (const row of callRows) {
      if (row.user_id) {
        callsByUser.set(row.user_id, (callsByUser.get(row.user_id) ?? 0) + 1)
      }
    }

    // Group emails by sent_by
    const emailByUser = new Map<string, { sent: number; opened: number; replied: number; bounced: number }>()
    for (const e of emails) {
      if (!e.sent_by) continue
      const cur = emailByUser.get(e.sent_by) ?? { sent: 0, opened: 0, replied: 0, bounced: 0 }
      if (e.status !== 'queued') cur.sent++
      if (e.status === 'opened')  cur.opened++
      if (e.status === 'replied') cur.replied++
      if (e.status === 'bounced') cur.bounced++
      emailByUser.set(e.sent_by, cur)
    }

    const stats = members.map((m) => {
      const meta     = m.users?.raw_user_meta_data as Record<string, unknown> | undefined
      const fullName = (meta?.full_name as string) ?? (meta?.name as string) ?? null
      const counts   = emailByUser.get(m.user_id) ?? { sent: 0, opened: 0, replied: 0, bounced: 0 }
      const openRate  = counts.sent > 0 ? Math.round((counts.opened  / counts.sent) * 1000) / 10 : 0
      const replyRate = counts.sent > 0 ? Math.round((counts.replied / counts.sent) * 1000) / 10 : 0

      return {
        user_id:        m.user_id,
        user_email:     m.users?.email ?? '',
        full_name:      fullName,
        role:           m.role,
        emails_sent:    counts.sent,
        emails_opened:  counts.opened,
        emails_replied: counts.replied,
        open_rate:      openRate,
        reply_rate:     replyRate,
        last_active:    null,   // TODO: join activities
        leads_assigned: leadsByUser.get(m.user_id) ?? 0,
        calls_count:    callsByUser.get(m.user_id)  ?? 0,
      }
    }).sort((a, b) => b.emails_sent - a.emails_sent)

    return NextResponse.json({ stats, date_range: range })
  } catch (err) {
    console.error('[GET /api/admin/team-stats]', err)
    return NextResponse.json({ error: 'Failed to load team stats' }, { status: 500 })
  }
}
