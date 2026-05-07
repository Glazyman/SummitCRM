/**
 * GET /api/analytics/batches
 * Per-batch lead performance. manager+
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

    const { data: batches } = await adminClient
      .from('lead_batches')
      .select('id, name, created_at')
      .eq('workspace_id', member.workspace_id)
      .order('created_at', { ascending: false })
      .limit(50) as { data: Array<{ id: string; name: string; created_at: string }> | null }

    if (!batches || batches.length === 0) {
      return NextResponse.json({ batches: [] })
    }

    const batchIds = batches.map(b => b.id)

    const [leadsRes, emailsRes] = await Promise.all([
      adminClient.from('leads').select('batch_id, status')
        .eq('workspace_id', member.workspace_id)
        .in('batch_id', batchIds).is('deleted_at', null),
      adminClient.from('emails').select('batch_id, status')
        .eq('workspace_id', member.workspace_id)
        .in('batch_id', batchIds),
    ]) as [
      { data: Array<{ batch_id: string; status: string }> | null },
      { data: Array<{ batch_id: string | null; status: string }> | null }
    ]

    const leadMap  = new Map<string, { total: number; converted: number }>()
    const emailMap = new Map<string, { sent: number; opened: number; replied: number }>()

    for (const l of leadsRes.data ?? []) {
      const c = leadMap.get(l.batch_id) ?? { total: 0, converted: 0 }
      c.total++
      if (l.status === 'converted') c.converted++
      leadMap.set(l.batch_id, c)
    }

    for (const e of emailsRes.data ?? []) {
      if (!e.batch_id) continue
      const c = emailMap.get(e.batch_id) ?? { sent: 0, opened: 0, replied: 0 }
      if (e.status !== 'queued') c.sent++
      if (['opened','clicked','replied'].includes(e.status)) c.opened++
      if (e.status === 'replied') c.replied++
      emailMap.set(e.batch_id, c)
    }

    const r = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0

    const rows = batches.map(b => {
      const l = leadMap.get(b.id)  ?? { total: 0, converted: 0 }
      const e = emailMap.get(b.id) ?? { sent: 0, opened: 0, replied: 0 }
      return {
        id:              b.id,
        name:            b.name,
        lead_count:      l.total,
        emails_sent:     e.sent,
        open_rate:       r(e.opened,  e.sent),
        reply_rate:      r(e.replied, e.sent),
        conversion_rate: r(l.converted, l.total),
        created_at:      b.created_at,
      }
    })

    return NextResponse.json({ batches: rows })
  } catch (err) {
    console.error('[GET /api/analytics/batches]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
