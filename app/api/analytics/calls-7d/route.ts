/**
 * GET /api/analytics/calls-7d
 * Daily call counts for the last 7 days. Reps see their own calls; admins see
 * the whole workspace. Buckets call_logs by UTC day in JS (low volume — for a
 * busy workspace this could hit PostgREST's 1000-row cap; fine for the test).
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
      .select('called_at')
      .eq('workspace_id', member.workspace_id)
      .gte('called_at', start.toISOString())
    if (member.role === 'rep') q = q.eq('logged_by', user.id)

    const { data: rows } = await q as { data: Array<{ called_at: string }> | null }

    // Seed the 7 day buckets so empty days still render.
    const buckets = new Map<string, number>()
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setUTCDate(start.getUTCDate() + i)
      buckets.set(dayKey(d), 0)
    }
    for (const r of rows ?? []) {
      const k = dayKey(new Date(r.called_at))
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1)
    }

    const series = [...buckets.entries()].map(([date, calls]) => ({ date, calls }))
    return NextResponse.json({ series })
  } catch (err) {
    console.error('[GET /api/analytics/calls-7d]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
