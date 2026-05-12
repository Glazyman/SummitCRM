/**
 * GET /api/analytics/time-series
 * Daily email stats over a date range. manager+ access.
 * Reps may access their own series if rep_id=self.
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

    let query = adminClient.from('emails')
      .select('sent_at, status')
      .eq('workspace_id', member.workspace_id)
      .gte('sent_at', start).lte('sent_at', end)
      .not('sent_at', 'is', null)

    if (repId)      query = query.eq('sent_by',     repId)      as typeof query
    if (campaignId) query = query.eq('campaign_id', campaignId) as typeof query

    // PostgREST caps select at 1000 rows by default — bump so analytics
    // aggregates are accurate at 10k+ rows.
    const { data: rows } = await query.range(0, 99999) as { data: Array<{ sent_at: string; status: string }> | null }

    // Bucket by date string
    const dayMap = new Map<string, { sent: number; opened: number; clicked: number; replied: number; bounced: number }>()

    for (const e of rows ?? []) {
      const date = e.sent_at.slice(0, 10)
      const cur  = dayMap.get(date) ?? { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 }
      cur.sent++
      if (['opened','clicked','replied'].includes(e.status)) cur.opened++
      if (e.status === 'clicked')  cur.clicked++
      if (e.status === 'replied')  cur.replied++
      if (e.status === 'bounced')  cur.bounced++
      dayMap.set(date, cur)
    }

    // Fill gaps for continuous date range
    const series: Array<{ date: string; sent: number; opened: number; clicked: number; replied: number; bounced: number }> = []
    const cursor = new Date(start.slice(0, 10))
    const endDay = new Date(end.slice(0, 10))
    while (cursor <= endDay) {
      const d = cursor.toISOString().slice(0, 10)
      series.push({ date: d, ...( dayMap.get(d) ?? { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 }) })
      cursor.setDate(cursor.getDate() + 1)
    }

    return NextResponse.json({ series })
  } catch (err) {
    console.error('[GET /api/analytics/time-series]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
