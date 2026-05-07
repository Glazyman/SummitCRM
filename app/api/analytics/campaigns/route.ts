/**
 * GET /api/analytics/campaigns
 * Campaign comparison with open/click/reply/bounce rates. manager+
 */
import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = createAdminClient()
    const { data: member } = await adminClient
      .from('workspace_members').select('workspace_id, role')
      .eq('user_id', user.id).eq('is_active', true).single() as
      { data: { workspace_id: string; role: string } | null }
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['manager','admin','super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end   = searchParams.get('end')

    let query = adminClient.from('campaigns')
      .select('id, name, status, total_leads, emails_sent, emails_opened, emails_clicked, emails_replied, emails_bounced, started_at, completed_at, created_at')
      .eq('workspace_id', member.workspace_id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (start) query = query.gte('created_at', start) as typeof query
    if (end)   query = query.lte('created_at', end)   as typeof query

    const { data: campaigns } = await query as {
      data: Array<{
        id: string; name: string; status: string; total_leads: number
        emails_sent: number; emails_opened: number; emails_clicked: number
        emails_replied: number; emails_bounced: number
        started_at: string | null; completed_at: string | null; created_at: string
      }> | null
    }

    const r = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0

    const rows = (campaigns ?? []).map(c => ({
      id:           c.id,
      name:         c.name,
      status:       c.status,
      total_leads:  c.total_leads,
      emails_sent:  c.emails_sent,
      open_rate:    r(c.emails_opened,  c.emails_sent),
      click_rate:   r(c.emails_clicked, c.emails_sent),
      reply_rate:   r(c.emails_replied, c.emails_sent),
      bounce_rate:  r(c.emails_bounced, c.emails_sent),
      started_at:   c.started_at,
      completed_at: c.completed_at,
      created_at:   c.created_at,
    }))

    return NextResponse.json({ campaigns: rows })
  } catch (err) {
    console.error('[GET /api/analytics/campaigns]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
