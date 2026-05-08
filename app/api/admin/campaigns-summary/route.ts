/**
 * GET /api/admin/campaigns-summary
 * Active + recent campaigns with performance stats.
 * Required: manager+
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request) {
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
      return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
    }

    const { data: campaigns } = await adminClient
      .from('campaigns')
      .select('id, name, status, total_leads, emails_sent, emails_opened, created_at')
      .eq('workspace_id', member.workspace_id)
      .in('status', ['running', 'scheduled', 'paused'])
      .order('created_at', { ascending: false })
      .limit(10) as {
        data: Array<{
          id: string; name: string; status: string; total_leads: number
          emails_sent: number; emails_opened: number; created_at: string
        }> | null
      }

    const result = (campaigns ?? []).map((c) => ({
      id:            c.id,
      name:          c.name,
      status:        c.status,
      total_leads:   c.total_leads,
      emails_sent:   c.emails_sent,
      emails_opened: c.emails_opened,
      open_rate:     c.emails_sent > 0
        ? Math.round((c.emails_opened / c.emails_sent) * 1000) / 10
        : 0,
      created_at:    c.created_at,
    }))

    return NextResponse.json({ campaigns: result })
  } catch (err) {
    console.error('[GET /api/admin/campaigns-summary]', err)
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 })
  }
}
