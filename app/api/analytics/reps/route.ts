/**
 * GET /api/analytics/reps
 * Per-rep email performance. admin+ access.
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
    if (!['admin','super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const now   = new Date()
    const start = searchParams.get('start') ?? new Date(new Date(now).setDate(now.getDate() - 30)).toISOString()
    const end   = searchParams.get('end')   ?? new Date().toISOString()

    const [membersRes, emailsRes, leadsRes] = await Promise.all([
      adminClient.from('workspace_members')
        .select('user_id, role, users:user_id(email, raw_user_meta_data)')
        .eq('workspace_id', member.workspace_id).eq('is_active', true),
      adminClient.from('emails').select('sent_by, status')
        .eq('workspace_id', member.workspace_id)
        .gte('sent_at', start).lte('sent_at', end),
      adminClient.from('leads').select('assigned_to')
        .eq('workspace_id', member.workspace_id).is('deleted_at', null),
    ]) as [
      { data: Array<{ user_id: string; role: string; users: { email: string; raw_user_meta_data: Record<string,unknown> } | null }> | null },
      { data: Array<{ sent_by: string | null; status: string }> | null },
      { data: Array<{ assigned_to: string | null }> | null }
    ]

    const emailMap = new Map<string, { sent: number; opened: number; replied: number; bounced: number }>()
    for (const e of emailsRes.data ?? []) {
      if (!e.sent_by) continue
      const c = emailMap.get(e.sent_by) ?? { sent: 0, opened: 0, replied: 0, bounced: 0 }
      c.sent++
      if (['opened','clicked','replied'].includes(e.status)) c.opened++
      if (e.status === 'replied') c.replied++
      if (e.status === 'bounced') c.bounced++
      emailMap.set(e.sent_by, c)
    }

    const leadsMap = new Map<string, number>()
    for (const l of leadsRes.data ?? []) {
      if (!l.assigned_to) continue
      leadsMap.set(l.assigned_to, (leadsMap.get(l.assigned_to) ?? 0) + 1)
    }

    const r = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0

    const reps = (membersRes.data ?? []).map(m => {
      const meta = m.users?.raw_user_meta_data as Record<string,unknown> | undefined
      const c    = emailMap.get(m.user_id) ?? { sent: 0, opened: 0, replied: 0, bounced: 0 }
      return {
        user_id:        m.user_id,
        user_email:     m.users?.email ?? '',
        full_name:      (meta?.full_name as string) ?? (meta?.name as string) ?? null,
        role:           m.role,
        emails_sent:    c.sent,
        open_rate:      r(c.opened,  c.sent),
        reply_rate:     r(c.replied, c.sent),
        bounce_rate:    r(c.bounced, c.sent),
        leads_assigned: leadsMap.get(m.user_id) ?? 0,
      }
    }).sort((a, b) => b.emails_sent - a.emails_sent)

    return NextResponse.json({ reps, period: { start, end } })
  } catch (err) {
    console.error('[GET /api/analytics/reps]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
