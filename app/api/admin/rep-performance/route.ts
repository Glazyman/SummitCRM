/**
 * GET /api/admin/rep-performance?period=today|week|month
 * Per-rep performance: calls, follow-ups, leads.
 * Admins only. Returns live data — no caching.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { getUsersById } from '@/lib/users'

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
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
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

    const rawPeriod = req.nextUrl.searchParams.get('period') ?? 'week'
    const period    = rawPeriod === 'today' ? 'day' : rawPeriod
    const anchor    = parseAnchor(req.nextUrl.searchParams.get('date'))
    const range     = periodRange(period, anchor)
    const wsId      = member.workspace_id

    // Fetch everything in parallel
    const [membersRes, callsRes, followUpsRes, leadsRes, statusActivitiesRes,
           leadsCalledInPeriodRes, workspaceRes] = await Promise.all([
      admin.from('workspace_members').select('user_id, role').eq('workspace_id', wsId).eq('is_active', true),
      admin.from('call_logs')
        .select('logged_by, outcome, called_at')
        .eq('workspace_id', wsId)
        .gte('called_at', range.start)
        .lt('called_at',  range.end),
      admin.from('follow_ups')
        .select('assigned_to, completed_at, due_at')
        .eq('workspace_id', wsId),
      // RPC aggregate — bypasses PostgREST row limit
      admin.rpc('get_leads_assigned_status_counts', { p_workspace_id: wsId }),
      admin.from('activity_logs')
        .select('user_id, metadata')
        .eq('workspace_id', wsId)
        .eq('type', 'lead_status_changed')
        .gte('created_at', range.start)
        .lt('created_at',  range.end),
      // Unique leads each rep called IN THIS PERIOD — bounded range.
      admin.rpc('get_unique_leads_called_by_rep_range', {
        p_workspace_id: wsId,
        p_start:        range.start,
        p_end:          range.end,
      }),
      // Workspace settings → default daily target + per-rep overrides
      admin.from('workspaces').select('settings').eq('id', wsId).single(),
    ])

    const leadsCalledRows = (leadsCalledInPeriodRes.data ?? []) as Array<{ user_id: string; leads_called: number }>
    const leadsCalledByUser = new Map(leadsCalledRows.map((r) => [r.user_id, Number(r.leads_called)]))

    const wsSettings = (workspaceRes.data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
    const workspaceDefault = Number(wsSettings.daily_call_target)
    const defaultTarget = Number.isFinite(workspaceDefault) && workspaceDefault > 0 ? Math.floor(workspaceDefault) : 100
    const overrideMap = (wsSettings.rep_daily_call_targets ?? {}) as Record<string, unknown>
    const targetForUser = (uid: string) => {
      const o = Number(overrideMap[uid])
      return Number.isFinite(o) && o > 0 ? Math.floor(o) : defaultTarget
    }

    const members   = (membersRes.data ?? []) as Array<{ user_id: string; role: string }>
    const memberIds = members.map((m) => m.user_id)
    const nameById  = await getUsersById(admin, wsId, memberIds)
    const calls     = (callsRes.data ?? []) as Array<{ logged_by: string; outcome: string; called_at: string }>
    const statusActivities = (statusActivitiesRes.data ?? []) as Array<{ user_id: string; metadata: Record<string, unknown> | null }>
    const followUps = (followUpsRes.data ?? []) as Array<{ assigned_to: string | null; completed_at: string | null; due_at: string }>
    // RPC returns [{assigned_to, status, cnt}] — expand into flat rows so filter logic works unchanged
    const leadCounts = (leadsRes.data ?? []) as Array<{ assigned_to: string | null; status: string; cnt: number }>
    const leads = leadCounts.flatMap(r => Array.from({ length: Number(r.cnt) }, () => ({ assigned_to: r.assigned_to, status: r.status })))

    const now = new Date()

    const statusToOutcome = new Map<string, string>([
      ['called', 'answered'],
      ['voicemail', 'voicemail'],
      ['no_answer', 'no_answer'],
      ['wrong_number', 'wrong_number'],
      ['sold_already', 'answered'],
    ])

    const syntheticCallsByUser = new Map<string, string[]>()
    for (const row of statusActivities) {
      if (!row.user_id) continue
      const md = row.metadata ?? {}
      if (md.bulk !== true) continue
      const nextStatus = typeof md.to === 'string' ? md.to : ''
      const outcome = statusToOutcome.get(nextStatus)
      if (!outcome) continue
      const existing = syntheticCallsByUser.get(row.user_id) ?? []
      existing.push(outcome)
      syntheticCallsByUser.set(row.user_id, existing)
    }

    // Aggregate per user
    const reps = members
      .filter(m => ['rep', 'admin', 'super_admin'].includes(m.role))
      .map(m => {
        const uid = m.user_id

        // Calls in period
        const myCalls = calls.filter(c => c.logged_by === uid)
        const callsByOutcome: Record<string, number> = {}
        for (const c of myCalls) {
          callsByOutcome[c.outcome] = (callsByOutcome[c.outcome] ?? 0) + 1
        }
        for (const outcome of (syntheticCallsByUser.get(uid) ?? [])) {
          callsByOutcome[outcome] = (callsByOutcome[outcome] ?? 0) + 1
        }

        // Follow-ups
        const myFUs = followUps.filter(f => f.assigned_to === uid)
        const fuPending   = myFUs.filter(f => !f.completed_at).length
        const fuOverdue   = myFUs.filter(f => !f.completed_at && new Date(f.due_at) < now).length
        const fuCompleted = myFUs.filter(f => f.completed_at && new Date(f.completed_at) >= new Date(range.start)).length

        // Leads
        const myLeads  = leads.filter(l => l.assigned_to === uid)
        const terminal = new Set(['do_not_contact', 'wrong_number', 'sold_already'])
        const active   = myLeads.filter(l => !terminal.has(l.status)).length

        return {
          id:               uid,
          name:             nameById.get(uid) ?? uid,
          role:             m.role,
          calls:            myCalls.length + (syntheticCallsByUser.get(uid)?.length ?? 0),
          callsByOutcome,
          followUpsPending:  fuPending,
          followUpsOverdue:  fuOverdue,
          followUpsCompleted: fuCompleted,
          leadsAssigned:    myLeads.length,
          leadsActive:      active,
          // Unique leads called in the selected period (day/week/month).
          // Plus the rep's daily target — UI decides whether to show
          // "X / Target" (day view) or just "X" (week/month view).
          leadsCalledInPeriod: leadsCalledByUser.get(uid) ?? 0,
          dailyCallTarget:     targetForUser(uid),
        }
      })
      .sort((a, b) => b.calls - a.calls)

    return NextResponse.json({ reps, period, range, anchor: anchor.toISOString().slice(0, 10) })
  } catch (err) {
    console.error('[GET /api/admin/rep-performance]', err)
    return NextResponse.json({ error: 'Failed to load rep performance' }, { status: 500 })
  }
}
