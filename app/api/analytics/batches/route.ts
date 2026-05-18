/**
 * GET /api/analytics/batches
 * Per-batch lead counts. manager+
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

    const { data: stats } = await adminClient.rpc('get_batch_analytics', {
      p_workspace_id: member.workspace_id,
      p_batch_ids:    batchIds,
    }) as { data: {
      leads:  Array<{ batch_id: string; total: number; converted: number }>
      emails: Array<{ batch_id: string; sent: number; opened: number; replied: number }>
    } | null }

    const leadMap = new Map<string, { total: number }>()
    for (const l of stats?.leads ?? []) leadMap.set(l.batch_id, { total: l.total })

    const rows = batches.map(b => ({
      id:         b.id,
      name:       b.name,
      lead_count: leadMap.get(b.id)?.total ?? 0,
      created_at: b.created_at,
    }))

    return NextResponse.json({ batches: rows })
  } catch (err) {
    console.error('[GET /api/analytics/batches]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
