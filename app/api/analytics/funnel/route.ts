/**
 * GET /api/analytics/funnel
 * Lead funnel counts by status. rep+ access (rep-scoped to their assigned leads).
 */
import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

const FUNNEL_ORDER = ['new','contacted','replied','interested','converted','do_not_contact','unsubscribed']

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

    const { searchParams } = new URL(req.url)
    const isRep = member.role === 'rep'

    // Use RPC aggregate for admins (bypasses PostgREST row limit).
    // Reps get per-rep counts via a direct filtered query (their data is small).
    let counts = new Map<string, number>()
    let total = 0

    if (isRep) {
      const { data: rows } = await adminClient
        .from('leads')
        .select('status')
        .eq('workspace_id', member.workspace_id)
        .eq('assigned_to', user.id)
        .is('deleted_at', null) as { data: Array<{ status: string }> | null }
      for (const row of rows ?? []) {
        counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
      }
      total = (rows ?? []).length
    } else {
      const { data: rows } = await adminClient
        .rpc('get_leads_status_counts', { p_workspace_id: member.workspace_id }) as
        { data: Array<{ status: string; cnt: number }> | null }
      for (const row of rows ?? []) {
        counts.set(row.status, Number(row.cnt))
        total += Number(row.cnt)
      }
    }

    // Only the conversion funnel stages (exclude DNC/unsub from drop-off calculation)
    const funnelStages = ['new','contacted','replied','interested','converted']
    const funnel = funnelStages.map(status => ({
      status,
      count: counts.get(status) ?? 0,
      percentage: total > 0 ? Math.round(((counts.get(status) ?? 0) / total) * 1000) / 10 : 0,
    }))

    // All statuses for full breakdown
    const breakdown = FUNNEL_ORDER.map(status => ({
      status,
      count: counts.get(status) ?? 0,
    })).filter(s => s.count > 0)

    return NextResponse.json({ funnel, breakdown, total })
  } catch (err) {
    console.error('[GET /api/analytics/funnel]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
