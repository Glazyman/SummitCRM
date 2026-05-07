/**
 * GET /api/analytics/email-metrics
 * Aggregate email stats for a date range. rep+ access.
 * Reps see only their own data.
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

    const { searchParams } = new URL(req.url)
    const now   = new Date()
    const start = searchParams.get('start') ?? new Date(now.setDate(now.getDate() - 30)).toISOString()
    const end   = searchParams.get('end')   ?? new Date().toISOString()
    const isRep = member.role === 'rep'
    const repId = isRep ? user.id : (searchParams.get('rep_id') ?? null)

    let query = adminClient.from('emails').select('status')
      .eq('workspace_id', member.workspace_id)
      .gte('sent_at', start).lte('sent_at', end)
      .not('status', 'eq', 'queued')

    if (repId) query = query.eq('sent_by', repId) as typeof query

    const { data: rows } = await query as { data: Array<{ status: string }> | null }
    const all = rows ?? []

    const sent    = all.length
    const opened  = all.filter(e => ['opened','clicked','replied'].includes(e.status)).length
    const clicked = all.filter(e => e.status === 'clicked').length
    const replied = all.filter(e => e.status === 'replied').length
    const bounced = all.filter(e => e.status === 'bounced').length
    const r = (n: number) => sent > 0 ? Math.round((n / sent) * 1000) / 10 : 0

    return NextResponse.json({
      period: { start, end },
      totals: {
        sent, opened, clicked, replied, bounced,
        open_rate: r(opened), click_rate: r(clicked),
        reply_rate: r(replied), bounce_rate: r(bounced),
      },
    })
  } catch (err) {
    console.error('[GET /api/analytics/email-metrics]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
