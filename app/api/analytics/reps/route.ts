/**
 * GET /api/analytics/reps
 * Per-rep call, follow-up, and lead performance. admin+ access.
 *
 * Aggregation runs inside Postgres via get_reps_analytics() — single
 * jsonb response bypasses PostgREST's 1000-row cap. Names + emails are
 * stitched in here via the users-lookup RPC.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { createAdminClient } from '@/lib/supabase/server'
import { getUsersByIdsFull } from '@/lib/users'
import { selectAll } from '@/lib/supabase/select-all'
import { firstCalls, inCallPeriod } from '@/lib/first-calls'

type RepRow = {
  user_id:              string
  role:                 string
  calls:                number
  calls_answered:       number
  calls_voicemail:      number
  calls_no_answer:      number
  calls_wrong_number:   number
  follow_ups_pending:   number
  follow_ups_overdue:   number
  follow_ups_completed: number
  leads_assigned:       number
  leads_active:         number
  leads_new:            number
}

export async function GET(req: Request) {
  try {
    const actor = await getActor()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['admin', 'super_admin'].includes(actor.role)) return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    const admin = createAdminClient()

    const { searchParams } = new URL(req.url)
    const now   = new Date()
    const start = searchParams.get('start') ?? new Date(new Date(now).setDate(now.getDate() - 30)).toISOString()
    const end   = searchParams.get('end')   ?? now.toISOString()
    const wsId  = actor.workspaceId
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end))
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    const timezone = searchParams.get('tz') ?? 'UTC'
    let dateFormat: Intl.DateTimeFormat
    try { dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }) }
    catch { return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 }) }

    // All independent database reads start together instead of four network waves.
    const [aggregate, callHistory, marks, completions, interestedRes, notInterestedRes, badLeadsRes, contactedRes] = await Promise.all([
      admin.rpc('get_reps_analytics', { p_workspace_id: wsId, p_start: start, p_end: end }),
      selectAll<{ id: string; lead_id: string; logged_by: string; outcome: string; called_at: string }>((from, to) =>
        (admin as any).from('call_logs').select('id, lead_id, logged_by, outcome, called_at')
          .eq('workspace_id', wsId).lt('called_at', end).order('id').range(from, to)),
      selectAll<{ id: string; lead_id: string; user_id: string | null; created_at: string }>((from, to) =>
        (admin as any).from('activity_logs').select('id, lead_id, user_id, created_at')
          .eq('workspace_id', wsId).eq('type', 'interest_status_changed').eq('metadata->>to', 'interested')
          .gte('created_at', start).lt('created_at', end).order('id').range(from, to)),
      selectAll<{ assigned_to: string }>((from, to) =>
        (admin as any).from('follow_ups').select('assigned_to')
          .eq('workspace_id', wsId).gte('completed_at', start).lt('completed_at', end).order('id').range(from, to)),
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).eq('interest_status', 'interested').is('deleted_at', null),
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).eq('interest_status', 'not_interested').is('deleted_at', null),
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).eq('status', 'do_not_contact').is('deleted_at', null),
      // Contacted leads (ever) — the meaningful denominator for the lead-status
      // breakdown. "% of total leads" was ~0 because most leads are untouched
      // "new"; lead-status % should be of the leads actually worked.
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).not('last_contacted_at', 'is', null).is('deleted_at', null),
    ])
    const calls = inCallPeriod(firstCalls(callHistory), start, end)
    const repFirstCalls = inCallPeriod(firstCalls(callHistory, true), start, end)
    if (aggregate.error) throw aggregate.error
    const payload = (aggregate.data ?? {}) as { reps?: RepRow[]; overview?: Record<string, number>; period?: { start: string; end: string } }
    const repsRaw = [...(payload.reps ?? [])]
    const currentIds = new Set(repsRaw.map(r => r.user_id))
    const contributors = new Set([
      ...repFirstCalls.map(call => call.logged_by || 'unattributed'),
      ...marks.map(mark => mark.user_id || 'unattributed'),
      ...completions.map(task => task.assigned_to || 'unattributed'),
    ])
    for (const id of contributors) if (!currentIds.has(id)) repsRaw.push({
      user_id: id, role: 'historical', calls: 0, calls_answered: 0, calls_voicemail: 0,
      calls_no_answer: 0, calls_wrong_number: 0, follow_ups_pending: 0, follow_ups_overdue: 0,
      follow_ups_completed: 0, leads_assigned: 0, leads_active: 0, leads_new: 0,
    })
    const memberUsers = await getUsersByIdsFull(admin, wsId, repsRaw.map(r => r.user_id).filter(id => id !== 'unattributed'))
    const nameById = new Map(memberUsers.map(u => [u.id, { name: u.user_metadata?.full_name ?? null, email: u.email ?? '' }]))
    const byRep = new Map<string, typeof calls>()
    for (const call of repFirstCalls) {
      const id = call.logged_by || 'unattributed'
      if (!byRep.has(id)) byRep.set(id, [])
      byRep.get(id)!.push(call)
    }
    const markedByRep = new Map<string, Set<string>>()
    for (const mark of marks) if (mark.lead_id) {
      const id = mark.user_id || 'unattributed'
      if (!markedByRep.has(id)) markedByRep.set(id, new Set())
      markedByRep.get(id)!.add(mark.lead_id)
    }
    const completedByRep = new Map<string, number>()
    for (const task of completions) completedByRep.set(task.assigned_to || 'unattributed', (completedByRep.get(task.assigned_to || 'unattributed') ?? 0) + 1)
    const reps = repsRaw.map(r => {
      const repCalls = byRep.get(r.user_id) ?? []
      return {
        ...r, user_email: nameById.get(r.user_id)?.email ?? '', full_name: nameById.get(r.user_id)?.name ?? (r.user_id === 'unattributed' ? 'Unattributed activity' : r.role === 'historical' && !nameById.has(r.user_id) ? 'Former teammate' : null),
        active_days: new Set(repCalls.map(c => dateFormat.format(new Date(c.called_at)))).size,
        last_call_at: repCalls.reduce<string | null>((last, c) => !last || c.called_at > last ? c.called_at : last, null),
        calls: repCalls.length, unique_leads: new Set(repCalls.map(c => c.lead_id).filter(Boolean)).size,
        calls_answered: repCalls.filter(c => c.outcome === 'answered').length,
        calls_voicemail: repCalls.filter(c => c.outcome === 'voicemail').length,
        calls_no_answer: repCalls.filter(c => c.outcome === 'no_answer').length,
        calls_wrong_number: repCalls.filter(c => c.outcome === 'wrong_number').length,
        calls_callback: repCalls.filter(c => c.outcome === 'callback_requested').length,
        interested_marked: markedByRep.get(r.user_id)?.size ?? 0,
        follow_ups_completed: completedByRep.get(r.user_id) ?? 0,
      }
    })
    const daily = new Map<string, { date: string; calls: number; leads: Set<string>; interested: Set<string> }>()
    const dayFor = (iso: string) => {
      const parts = dateFormat.formatToParts(new Date(iso))
      const get = (type: string) => parts.find(p => p.type === type)?.value
      const date = `${get('year')}-${get('month')}-${get('day')}`
      if (!daily.has(date)) daily.set(date, { date, calls: 0, leads: new Set(), interested: new Set() })
      return daily.get(date)!
    }
    for (const call of calls) { const day = dayFor(call.called_at); day.calls++; if (call.lead_id) day.leads.add(call.lead_id) }
    for (const mark of marks) if (mark.lead_id) dayFor(mark.created_at).interested.add(mark.lead_id)

    // Current workspace state is separate from activity in the selected period.

    if ([interestedRes, notInterestedRes, badLeadsRes, contactedRes].some(r => 'error' in r && r.error)) throw new Error('Could not load lead totals')
    return NextResponse.json({
      reps,
      historyStart: calls.reduce<string | undefined>((first, call) => !first || call.called_at < first ? call.called_at : first, undefined),
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ date: d.date, calls: d.calls, unique_leads: d.leads.size, interested: d.interested.size })),
      overview: {
        ...(payload.overview ?? {}),
        total: calls.length,
        answered: calls.filter(c => c.outcome === 'answered').length,
        voicemail: calls.filter(c => c.outcome === 'voicemail').length,
        no_answer: calls.filter(c => c.outcome === 'no_answer').length,
        wrong_number: calls.filter(c => c.outcome === 'wrong_number').length,
        callback: calls.filter(c => c.outcome === 'callback_requested').length,
        unique_leads: new Set(calls.map(c => c.lead_id).filter(Boolean)).size,
        interested_marked: new Set(marks.map(m => m.lead_id).filter(Boolean)).size,
        follow_ups_completed: completions.length,
        interested:      interestedRes.count    ?? 0,
        not_interested:  notInterestedRes.count ?? 0,
        bad_leads:       badLeadsRes.count       ?? 0,
        contacted_total: contactedRes.count      ?? 0,
      },
      period: payload.period ?? { start, end },
    })
  } catch (err) {
    console.error('[GET /api/analytics/reps]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
