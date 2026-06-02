/**
 * GET /api/analytics/calls-7d?start=ISO&end=ISO
 * Per-day activity bar data. Reps see their own activity; admins see the whole
 * workspace. For each day we report:
 *   - calls        : raw call_logs rows that day
 *   - leads_called : DISTINCT lead_id that day (the "per person / once each"
 *                    metric the analytics page is built around)
 *
 * Window: if start/end are passed they define the range (so the chart matches
 * whatever range the analytics page is showing, and its bars reconcile with the
 * Call Summary total). Capped to the most recent 30 day-buckets so a wide range
 * like "All" doesn't render hundreds of bars. Defaults to the last 7 days.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

const DAY = 86_400_000
const dayKey = (d: Date) => d.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
const utcMidnight = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

export async function GET(req: Request) {
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

    const url      = new URL(req.url)
    const endParam = url.searchParams.get('end')
    const stParam  = url.searchParams.get('start')

    const end   = endParam ? new Date(endParam) : new Date()
    let   start = stParam  ? new Date(stParam)  : new Date(end.getTime() - 6 * DAY)
    // cap to the most recent 30 days so wide ranges stay readable
    const minStart = new Date(end.getTime() - 29 * DAY)
    if (start < minStart) start = minStart

    const dayStart = utcMidnight(start)
    const dayEnd   = utcMidnight(end)
    const nDays    = Math.max(1, Math.round((dayEnd.getTime() - dayStart.getTime()) / DAY) + 1)

    let q = admin
      .from('call_logs')
      .select('called_at, lead_id')
      .eq('workspace_id', member.workspace_id)
      .gte('called_at', dayStart.toISOString())
      .lte('called_at', end.toISOString())
    if (member.role === 'rep') q = q.eq('logged_by', user.id)

    const { data: rows } = await q as { data: Array<{ called_at: string; lead_id: string }> | null }

    // Seed buckets so empty days still render.
    const calls = new Map<string, number>()
    const leads = new Map<string, Set<string>>()
    for (let i = 0; i < nDays; i++) {
      const k = dayKey(new Date(dayStart.getTime() + i * DAY))
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
