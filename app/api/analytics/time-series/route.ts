/**
 * GET /api/analytics/time-series
 * Daily email stats over a date range. manager+ access.
 * Reps may access their own series if rep_id=self.
 *
 * Aggregation runs inside Postgres via get_time_series_analytics() — single
 * jsonb response bypasses PostgREST's 1000-row cap.
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
    if (!['manager','admin','super_admin','rep'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient role' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const now   = new Date()
    const start = searchParams.get('start') ?? new Date(new Date(now).setDate(now.getDate() - 30)).toISOString()
    const end   = searchParams.get('end')   ?? new Date().toISOString()
    const isRep = member.role === 'rep'
    const repId = isRep ? user.id : (searchParams.get('rep_id') ?? null)
    const campaignId = searchParams.get('campaign_id')

    const { data, error } = await adminClient.rpc('get_time_series_analytics', {
      p_workspace_id: member.workspace_id,
      p_start:        start,
      p_end:          end,
      p_rep_id:       repId,
      p_campaign_id:  campaignId,
    })

    if (error) {
      console.error('[get_time_series_analytics]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? { series: [] })
  } catch (err) {
    console.error('[GET /api/analytics/time-series]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
