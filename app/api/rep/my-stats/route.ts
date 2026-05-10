/**
 * GET /api/rep/my-stats?period=today|week|month
 * Current user's own call, follow-up, and lead stats.
 * Accessible by all authenticated workspace members.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

function periodRange(period: string) {
  const now   = new Date()
  const start = new Date(now)

  if (period === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (period === 'week') {
    const day = start.getDay()
    const diff = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + diff)
    start.setHours(0, 0, 0, 0)
  } else {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }

  return { start: start.toISOString(), end: now.toISOString() }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: member } = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const period = req.nextUrl.searchParams.get('period') ?? 'week'
    const range  = periodRange(period)
    const wsId   = member.workspace_id
    const uid    = user.id
    const now    = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const [callsRes, followUpsRes, leadsRes, callsTodayRes, interestedTodayRes, followUpsSetTodayRes] = await Promise.all([
      admin.from('call_logs')
        .select('outcome, called_at')
        .eq('workspace_id', wsId)
        .eq('logged_by', uid)
        .gte('called_at', range.start),
      admin.from('follow_ups')
        .select('completed_at, due_at')
        .eq('workspace_id', wsId)
        .eq('assigned_to', uid),
      admin.from('leads')
        .select('status')
        .eq('workspace_id', wsId)
        .eq('assigned_to', uid)
        .is('deleted_at', null),
      admin.from('call_logs')
        .select('outcome')
        .eq('workspace_id', wsId)
        .eq('logged_by', uid)
        .gte('called_at', startOfToday.toISOString()),
      admin.from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId)
        .eq('assigned_to', uid)
        .eq('interest_status', 'interested')
        .gte('updated_at', startOfToday.toISOString())
        .is('deleted_at', null),
      admin.from('follow_ups')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId)
        .eq('assigned_to', uid)
        .gte('created_at', startOfToday.toISOString()),
    ])

    const calls     = (callsRes.data ?? []) as Array<{ outcome: string; called_at: string }>
    const followUps = (followUpsRes.data ?? []) as Array<{ completed_at: string | null; due_at: string }>
    const leads     = (leadsRes.data ?? []) as Array<{ status: string }>
    const callsTodayRows = (callsTodayRes.data ?? []) as Array<{ outcome: string }>

    const callsByOutcome: Record<string, number> = {}
    for (const c of calls) callsByOutcome[c.outcome] = (callsByOutcome[c.outcome] ?? 0) + 1

    const terminal = new Set(['do_not_contact', 'wrong_number', 'sold_already'])
    const conversationsToday = callsTodayRows.filter((c) => c.outcome === 'answered' || c.outcome === 'callback_requested').length

    return NextResponse.json({
      calls:              calls.length,
      callsByOutcome,
      followUpsPending:   followUps.filter(f => !f.completed_at).length,
      followUpsOverdue:   followUps.filter(f => !f.completed_at && new Date(f.due_at) < now).length,
      followUpsCompleted: followUps.filter(f => f.completed_at && new Date(f.completed_at) >= new Date(range.start)).length,
      leadsAssigned:      leads.length,
      leadsActive:        leads.filter(l => !terminal.has(l.status)).length,
      funnel: {
        calls_made: callsTodayRows.length,
        conversations: conversationsToday,
        interested: interestedTodayRes.count ?? 0,
        follow_ups_set: followUpsSetTodayRes.count ?? 0,
      },
    })
  } catch (err) {
    console.error('[GET /api/rep/my-stats]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
