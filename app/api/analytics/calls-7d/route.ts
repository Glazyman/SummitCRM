/**
 * GET /api/analytics/calls-7d
 * Per-day activity for the last 7 days. Reps see their own activity; admins
 * see the whole workspace. For each day we report:
 *   - calls        : raw call_logs rows that day
 *   - leads_called : DISTINCT lead_id that day (the "per person / once each"
 *                    metric the analytics page is built around — a lead called
 *                    twice in a day counts once)
 * Buckets call_logs by UTC day in JS (low volume — for a busy workspace this
 * could hit PostgREST's 1000-row cap).
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

const dayKey = (d: Date) => d.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = await createServerClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: member } = await admin
      .from('workspace_members').select('workspace_id, role')
      .eq('user_id', user.id).eq('is_active', true).single() as
      { data: { workspace_id: string; role: string } | null }
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const now   = new Date()
    const start = new Date(now)
    start.setUTCDate(now.getUTCDate() - 6)
    start.setUTCHours(0, 0, 0, 0)

    let q = admin
      .from('call_logs')
      .select('called_at, lead_id')
      .eq('workspace_id', member.workspace_id)
      .gte('called_at', start.toISOString())
    if (member.role === 'rep') q = q.eq('logged_by', user.id)

    const { data: rows } = await q as { data: Array<{ called_at: string; lead_id: string }> | null }

    // Seed the 7 day buckets so empty days still render. Track distinct leads
    // per day with a Set, raw calls with a counter.
    const calls = new Map<string, number>()
    const leads = new Map<string, Set<string>>()
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setUTCDate(start.getUTCDate() + i)
      const k = dayKey(d)
      calls.set(k, 0)
      leads.set(k, new Set())
    }
    for (const r of rows ?? []) {
      const k = dayKey(new Date(r.called_at))
      if (!calls.has(k)) continue
      calls.set(k, (calls.get(k) ?? 0) + 1)
      leads.get(k)!.add(r.lead_id)
    }

    const series = [...calls.entries()].map(([date, c]) => ({
      date,
      calls: c,
      leads_called: leads.get(date)?.size ?? 0,
    }))
    return NextResponse.json({ series })
  } catch (err) {
    console.error('[GET /api/analytics/calls-7d]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
