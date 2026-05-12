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

    // SQL aggregate returned as a single jsonb value — PostgREST's
    // db-max-rows cap (1000) doesn't apply to single-row responses, so
    // batch counts are accurate even at 10k+ leads per batch. The previous
    // approach silently truncated to 1000.
    const { data: stats } = await adminClient.rpc('get_batch_analytics', {
      p_workspace_id: member.workspace_id,
      p_batch_ids:    batchIds,
    }) as { data: {
      leads:  Array<{ batch_id: string; total: number; converted: number }>
      emails: Array<{ batch_id: string; sent: number; opened: number; replied: number }>
    } | null }

    const leadMap  = new Map<string, { total: number; converted: number }>()
    const emailMap = new Map<string, { sent: number; opened: number; replied: number }>()

    for (const l of stats?.leads ?? [])  leadMap.set(l.batch_id,  { total: l.total, converted: l.converted })
    for (const e of stats?.emails ?? []) emailMap.set(e.batch_id, { sent: e.sent, opened: e.opened, replied: e.replied })

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
