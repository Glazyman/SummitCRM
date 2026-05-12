/**
 * GET /api/analytics/reps
 * Per-rep call, follow-up, and lead performance. admin+ access.
 */
import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { getUsersByIdsFull } from '@/lib/users'

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: member } = await admin
      .from('workspace_members').select('workspace_id, role')
      .eq('user_id', user.id).eq('is_active', true).single() as
      { data: { workspace_id: string; role: string } | null }
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const now   = new Date()
    const start = searchParams.get('start') ?? new Date(new Date(now).setDate(now.getDate() - 30)).toISOString()
    const end   = searchParams.get('end')   ?? now.toISOString()
    const wsId  = member.workspace_id

    const [membersRes, callsRes, followUpsRes, leadsRes] = await Promise.all([
      admin.from('workspace_members').select('user_id, role').eq('workspace_id', wsId).eq('is_active', true),
      admin.from('call_logs').select('logged_by, outcome').eq('workspace_id', wsId).gte('called_at', start).lte('called_at', end).range(0, 99999),
      admin.from('follow_ups').select('assigned_to, completed_at, due_at').eq('workspace_id', wsId).range(0, 99999),
      // RPC aggregate — bypasses PostgREST row limit
      admin.rpc('get_leads_assigned_status_counts', { p_workspace_id: wsId }),
    ])

    const members   = (membersRes.data ?? []) as Array<{ user_id: string; role: string }>
    const memberIds = members.map((m) => m.user_id)
    const memberUsers = await getUsersByIdsFull(admin, wsId, memberIds)
    const calls     = (callsRes.data ?? []) as Array<{ logged_by: string; outcome: string }>
    const followUps = (followUpsRes.data ?? []) as Array<{ assigned_to: string | null; completed_at: string | null; due_at: string }>
    // RPC returns [{assigned_to, status, cnt}] — expand into flat rows for existing logic
    const leadCounts = (leadsRes.data ?? []) as Array<{ assigned_to: string | null; status: string; cnt: number }>
    const leads = leadCounts.flatMap(r => Array.from({ length: Number(r.cnt) }, () => ({ assigned_to: r.assigned_to, status: r.status })))

    const nameById = new Map(
      memberUsers.map(u => [u.id, { name: (u.user_metadata?.full_name as string | undefined) ?? null, email: u.email ?? '' }])
    )

    const nowDate    = new Date()
    const terminal   = new Set(['do_not_contact', 'wrong_number', 'sold_already'])
    const periodStart = new Date(start)

    const reps = members.map(m => {
      const uid    = m.user_id
      const user   = nameById.get(uid)
      const myCalls = calls.filter(c => c.logged_by === uid)
      const myFUs   = followUps.filter(f => f.assigned_to === uid)
      const myLeads = leads.filter(l => l.assigned_to === uid)

      const byOutcome = (o: string) => myCalls.filter(c => c.outcome === o).length

      return {
        user_id:              uid,
        user_email:           user?.email ?? '',
        full_name:            user?.name ?? null,
        role:                 m.role,
        calls:                myCalls.length,
        calls_answered:       byOutcome('answered'),
        calls_voicemail:      byOutcome('voicemail'),
        calls_no_answer:      byOutcome('no_answer'),
        calls_wrong_number:   byOutcome('wrong_number'),
        follow_ups_pending:   myFUs.filter(f => !f.completed_at).length,
        follow_ups_overdue:   myFUs.filter(f => !f.completed_at && new Date(f.due_at) < nowDate).length,
        follow_ups_completed: myFUs.filter(f => f.completed_at && new Date(f.completed_at) >= periodStart).length,
        leads_assigned:       myLeads.length,
        leads_active:         myLeads.filter(l => !terminal.has(l.status)).length,
        leads_new:            myLeads.filter(l => l.status === 'new').length,
      }
    }).sort((a, b) => b.calls - a.calls)

    // Overall call overview for the period
    const overview = {
      total:              calls.length,
      answered:           calls.filter(c => c.outcome === 'answered').length,
      voicemail:          calls.filter(c => c.outcome === 'voicemail').length,
      no_answer:          calls.filter(c => c.outcome === 'no_answer').length,
      wrong_number:       calls.filter(c => c.outcome === 'wrong_number').length,
      callback:           calls.filter(c => c.outcome === 'callback_requested').length,
      follow_ups_due:     followUps.filter(f => !f.completed_at).length,
      follow_ups_overdue: followUps.filter(f => !f.completed_at && new Date(f.due_at) < nowDate).length,
      leads_total:        leads.length,
      leads_active:       leads.filter(l => !terminal.has(l.status)).length,
    }

    return NextResponse.json({ reps, overview, period: { start, end } })
  } catch (err) {
    console.error('[GET /api/analytics/reps]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
