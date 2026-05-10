/**
 * GET /api/admin/rep-performance?period=today|week|month
 * Per-rep performance: calls, follow-ups, leads.
 * Admins only. Returns live data — no caching.
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
    const diff = day === 0 ? -6 : 1 - day // Monday start
    start.setDate(start.getDate() + diff)
    start.setHours(0, 0, 0, 0)
  } else {
    // month
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
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 })
    }

    const period = req.nextUrl.searchParams.get('period') ?? 'week'
    const range  = periodRange(period)
    const wsId   = member.workspace_id

    // Fetch everything in parallel
    const [membersRes, usersRes, callsRes, followUpsRes, leadsRes, statusActivitiesRes] = await Promise.all([
      admin.from('workspace_members').select('user_id, role').eq('workspace_id', wsId).eq('is_active', true),
      admin.auth.admin.listUsers(),
      admin.from('call_logs')
        .select('logged_by, outcome, called_at')
        .eq('workspace_id', wsId)
        .gte('called_at', range.start),
      admin.from('follow_ups')
        .select('assigned_to, completed_at, due_at')
        .eq('workspace_id', wsId),
      admin.from('leads')
        .select('assigned_to, status')
        .eq('workspace_id', wsId)
        .is('deleted_at', null),
      admin.from('activity_logs')
        .select('user_id, metadata')
        .eq('workspace_id', wsId)
        .eq('type', 'lead_status_changed')
        .gte('created_at', range.start)
        .lte('created_at', range.end),
    ])

    const members   = (membersRes.data ?? []) as Array<{ user_id: string; role: string }>
    const allUsers  = usersRes.data?.users ?? []
    const calls     = (callsRes.data ?? []) as Array<{ logged_by: string; outcome: string; called_at: string }>
    const statusActivities = (statusActivitiesRes.data ?? []) as Array<{ user_id: string; metadata: Record<string, unknown> | null }>
    const followUps = (followUpsRes.data ?? []) as Array<{ assigned_to: string | null; completed_at: string | null; due_at: string }>
    const leads     = (leadsRes.data ?? []) as Array<{ assigned_to: string | null; status: string }>

    const now = new Date()

    // Build user name map
    const nameById = new Map(
      allUsers.map(u => [u.id, (u.user_metadata?.full_name as string | undefined) ?? u.email ?? u.id])
    )

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
        }
      })
      .sort((a, b) => b.calls - a.calls)

    return NextResponse.json({ reps, period, range })
  } catch (err) {
    console.error('[GET /api/admin/rep-performance]', err)
    return NextResponse.json({ error: 'Failed to load rep performance' }, { status: 500 })
  }
}
