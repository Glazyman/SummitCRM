/**
 * GET /api/admin/activity
 * Recent workspace-level activity feed (last 50 events).
 * Required: admin+
 *
 * Query params:
 *  - type: filter by event type (e.g. 'email_sent', 'lead_created')
 *  - limit: max results (default 50, max 100)
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = [
  'email_sent', 'email_opened', 'email_replied', 'email_bounced',
  'lead_created', 'lead_status_changed', 'lead_assigned',
  'note_added', 'follow_up_created', 'follow_up_completed',
  'campaign_started', 'campaign_paused', 'campaign_completed',
  'member_invited', 'member_role_changed',
  'sending_account_added',
]

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
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const typeFilter = searchParams.get('type')
    const limit      = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
    const isManager  = member.role === 'manager'

    let query = adminClient
      .from('activities')
      .select('id, type, user_id, metadata, created_at, leads!inner(workspace_id)')
      .eq('leads.workspace_id', member.workspace_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (typeFilter && ALLOWED_TYPES.includes(typeFilter)) {
      query = query.eq('type', typeFilter) as typeof query
    }

    // Managers cannot see admin-level events
    if (isManager) {
      query = query.not('type', 'in', '("member_invited","member_role_changed","sending_account_added")') as typeof query
    }

    const { data: rows } = await query as {
      data: Array<{
        id: string; type: string; user_id: string
        metadata: Record<string, unknown> | null; created_at: string
      }> | null
    }

    // Enrich with user info
    const userIds = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))]

    let userMap: Map<string, { email: string; full_name: string | null }> = new Map()
    if (userIds.length > 0) {
      const { data: membersData } = await adminClient
        .from('workspace_members')
        .select('user_id, users:user_id(email, raw_user_meta_data)')
        .eq('workspace_id', member.workspace_id)
        .in('user_id', userIds) as {
          data: Array<{ user_id: string; users: { email: string; raw_user_meta_data: Record<string, unknown> } | null }> | null
        }

      for (const m of membersData ?? []) {
        const meta = m.users?.raw_user_meta_data as Record<string, unknown> | undefined
        userMap.set(m.user_id, {
          email:     m.users?.email ?? '',
          full_name: (meta?.full_name as string) ?? (meta?.name as string) ?? null,
        })
      }
    }

    const events = (rows ?? []).map((r) => ({
      id:         r.id,
      type:       r.type,
      user_id:    r.user_id,
      user_name:  userMap.get(r.user_id)?.full_name ?? null,
      user_email: userMap.get(r.user_id)?.email     ?? '',
      metadata:   r.metadata ?? {},
      created_at: r.created_at,
    }))

    return NextResponse.json({ events, allowed_types: ALLOWED_TYPES })
  } catch (err) {
    console.error('[GET /api/admin/activity]', err)
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 })
  }
}
