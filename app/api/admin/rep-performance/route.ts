/**
 * GET /api/admin/rep-performance?start=<iso>&end=<iso>
 * Per-rep performance: calls, follow-ups, leads, over a rolling date range.
 * (Legacy fallback: ?period=today|week|month&date=YYYY-MM-DD.)
 * Admins only. Returns live data — no caching.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getVerifiedUser } from '@/lib/supabase/verified-user'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { resolveDailyCallTarget } from '@/lib/call-targets'
import { getUsersById } from '@/lib/users'
import { selectAll } from '@/lib/supabase/select-all'
import { firstCalls, inCallPeriod } from '@/lib/first-calls'

/** Parse "YYYY-MM-DD" into a Date at local midnight. Falls back to today. */
function parseAnchor(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    if (!Number.isNaN(dt.getTime())) return dt
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

/**
 * Returns [start, end) in ISO for the requested period anchored on `date`.
 * `period`:
 *   day   → exactly that calendar day
 *   week  → Mon–Sun containing that date
 *   month → calendar month containing that date
 * Accepts the legacy "today" alias for "day".
 */
function periodRange(period: string, anchor: Date) {
  const start = new Date(anchor)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)

  if (period === 'week') {
    const day = start.getDay()
    const diff = day === 0 ? -6 : 1 - day // Monday start
    start.setDate(start.getDate() + diff)
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 7)
  } else if (period === 'month') {
    start.setDate(1)
    end.setTime(start.getTime())
    end.setMonth(end.getMonth() + 1)
  } else {
    // day (or legacy "today")
    end.setDate(end.getDate() + 1)
  }

  return { start: start.toISOString(), end: end.toISOString() }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await getVerifiedUser(supabase)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: member } = await admin
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 })
    }

    const sp = req.nextUrl.searchParams
    // Preferred: explicit rolling range (start/end ISO), matching the
    // analytics page presets (today / last 7d / last 30d / all time).
    // Legacy fallback: calendar period + anchor date.
    const startParam = sp.get('start')
    const endParam   = sp.get('end')
    let range: { start: string; end: string }
    if (startParam && endParam) {
      range = { start: startParam, end: endParam }
    } else {
      const rawPeriod = sp.get('period') ?? 'week'
      const period    = rawPeriod === 'today' ? 'day' : rawPeriod
      const anchor    = parseAnchor(sp.get('date'))
      range = periodRange(period, anchor)
    }
    const wsId = member.workspace_id

    // First calls are selected across history before applying the date window.
    const [membersRes, followUpsRes, leadsRes, workspaceRes, callLeadRows] = await Promise.all([
      admin.from('workspace_members').select('user_id, role').eq('workspace_id', wsId).eq('is_active', true),
      selectAll<{ assigned_to: string; completed_at: string | null; due_at: string }>((from, to) =>
        admin.from('follow_ups').select('assigned_to, completed_at, due_at')
          .eq('workspace_id', wsId).order('id').range(from, to)).then(data => ({ data })),
      // RPC aggregate — bypasses PostgREST row limit
      admin.rpc('get_leads_assigned_status_counts', { p_workspace_id: wsId }),
      // Workspace settings → default daily target + per-rep overrides
      admin.from('workspaces').select('settings').eq('id', wsId).single(),
      selectAll<{ id: string; lead_id: string; called_at: string; logged_by: string; outcome: string }>((from, to) =>
        admin.from('call_logs').select('id, lead_id, called_at, logged_by, outcome').eq('workspace_id', wsId)
          .lt('called_at', range.end).order('id').range(from, to)),
    ])
    const uniqueLeads = inCallPeriod(firstCalls(callLeadRows), range.start, range.end).length
    const firstByRep = inCallPeriod(firstCalls(callLeadRows, true), range.start, range.end)

    // Leads each rep MARKED interested in the window (interest-change log).
    const marks = await selectAll<{ user_id: string | null; lead_id: string }>((from, to) =>
      (admin as any).from('activity_logs').select('user_id, lead_id')
        .eq('workspace_id', wsId).eq('type', 'interest_status_changed').eq('metadata->>to', 'interested')
        .gte('created_at', range.start).lt('created_at', range.end).order('id').range(from, to))
    const marksByRep = new Map<string, number>()
    const seenMarks = new Set<string>()
    for (const m of marks) if (m.user_id && m.lead_id && !seenMarks.has(`${m.user_id}:${m.lead_id}`)) {
      seenMarks.add(`${m.user_id}:${m.lead_id}`)
      marksByRep.set(m.user_id, (marksByRep.get(m.user_id) ?? 0) + 1)
    }


    const wsSettings = (workspaceRes.data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
    const targetForUser = (uid: string) => resolveDailyCallTarget(wsSettings, uid)

    const members   = (membersRes.data ?? []) as Array<{ user_id: string; role: string }>
    const memberIds = members.map((m) => m.user_id)
    const nameById  = await getUsersById(admin, wsId, memberIds)

    const followUps = (followUpsRes.data ?? []) as Array<{ assigned_to: string | null; completed_at: string | null; due_at: string }>
    // RPC returns [{assigned_to, status, cnt}] — expand into flat rows so filter logic works unchanged
    const leadCounts = (leadsRes.data ?? []) as Array<{ assigned_to: string | null; status: string; cnt: number }>
    const leads = leadCounts.flatMap(r => Array.from({ length: Number(r.cnt) }, () => ({ assigned_to: r.assigned_to, status: r.status })))

    const now = new Date()
    const startMs = Date.parse(range.start)
    const endMs   = Date.parse(range.end)

    // Aggregate per user
    const reps = members
      .filter(m => ['rep', 'admin', 'super_admin'].includes(m.role))
      .map(m => {
        const uid = m.user_id

        // First calls by this rep, within the selected period
        const myCalls = firstByRep.filter(c => c.logged_by === uid)
        const callsByOutcome: Record<string, number> = {}
        for (const call of myCalls) callsByOutcome[call.outcome] = (callsByOutcome[call.outcome] ?? 0) + 1

        // Follow-ups
        const myFUs = followUps.filter(f => f.assigned_to === uid)
        const fuPending   = myFUs.filter(f => !f.completed_at).length
        const fuOverdue   = myFUs.filter(f => !f.completed_at && new Date(f.due_at) < now).length
        const fuCompleted = myFUs.filter(f => {
          if (!f.completed_at) return false
          const t = Date.parse(f.completed_at)
          return t >= startMs && t < endMs
        }).length

        // Leads
        const myLeads  = leads.filter(l => l.assigned_to === uid)
        const terminal = new Set(['do_not_contact', 'wrong_number', 'sold_already'])
        const active   = myLeads.filter(l => !terminal.has(l.status)).length

        return {
          id:               uid,
          name:             nameById.get(uid) ?? uid,
          role:             m.role,
          calls:            myCalls.length,
          callsByOutcome,
          followUpsPending:  fuPending,
          followUpsOverdue:  fuOverdue,
          followUpsCompleted: fuCompleted,
          leadsAssigned:    myLeads.length,
          leadsActive:      active,
          // Unique leads called in the selected period (day/week/month).
          // Plus the rep's daily target — UI decides whether to show
          // "X / Target" (day view) or just "X" (week/month view).
          leadsCalledInPeriod: myCalls.length,
          dailyCallTarget:     targetForUser(uid),
          interestedMarked:    marksByRep.get(uid) ?? 0,
        }
      })
      .sort((a, b) => b.leadsCalledInPeriod - a.leadsCalledInPeriod)

    return NextResponse.json({ reps, range, uniqueLeads, historyStart: callLeadRows.reduce<string | undefined>((first, call) => !first || call.called_at < first ? call.called_at : first, undefined) })
  } catch (err) {
    console.error('[GET /api/admin/rep-performance]', err)
    return NextResponse.json({ error: 'Failed to load rep performance' }, { status: 500 })
  }
}
