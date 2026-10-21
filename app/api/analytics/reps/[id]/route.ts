/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { selectAll } from '@/lib/supabase/select-all'
import { firstCalls, inCallPeriod } from '@/lib/first-calls'
import { getActor } from '@/lib/auth/actor'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: repId } = await params
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(repId)) return NextResponse.json({ error: 'Invalid rep' }, { status: 400 })
    const start = req.nextUrl.searchParams.get('start')
    const end = req.nextUrl.searchParams.get('end')

    const actor = await getActor()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['admin', 'super_admin'].includes(actor.role)) return NextResponse.json({ error: 'Admin required' }, { status: 403 })
    if ((start && !Number.isFinite(Date.parse(start))) || (end && !Number.isFinite(Date.parse(end)))) return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
    const admin = createAdminClient()
    const member = { workspace_id: actor.workspaceId }

    const callsQuery = selectAll<{ id: string; lead_id: string | null; outcome: string; notes: string | null; called_at: string }>((from, to) => admin.from('call_logs')
      .select('id, lead_id, outcome, notes, called_at').eq('workspace_id', member.workspace_id)
      .eq('logged_by', repId).order('id').range(from, to))

    let followUpsQuery = (admin as any)
      .from('follow_ups')
      .select('id, lead_id, title, notes, due_at, completed_at, created_at')
      .eq('workspace_id', member.workspace_id)
      .eq('assigned_to', repId)
      .order('due_at', { ascending: true })
      .limit(500)

    if (start && end) followUpsQuery = followUpsQuery.or(`completed_at.is.null,and(completed_at.gte.${new Date(start).toISOString()},completed_at.lt.${new Date(end).toISOString()})`)

    const [callsRes, fuRes] = await Promise.all([callsQuery, followUpsQuery])

    if (fuRes.error) throw fuRes.error
    const calls = inCallPeriod(firstCalls(callsRes), start ?? new Date(0).toISOString(), end ?? new Date().toISOString()).sort((a, b) => Date.parse(b.called_at) - Date.parse(a.called_at))
    const followUps = (fuRes.data ?? []) as Array<{ id: string; lead_id: string; title: string; notes: string | null; due_at: string; completed_at: string | null; created_at: string }>

    const leadIds = Array.from(new Set([
      ...calls.map((c) => c.lead_id).filter(Boolean),
      ...followUps.map((f) => f.lead_id).filter(Boolean),
    ])) as string[]

    let leadMap = new Map<string, { id: string; first_name: string | null; last_name: string | null; company: string | null; email: string }>()
    if (leadIds.length > 0) {
      const { data: leads } = await (admin as any)
        .from('leads')
        .select('id, first_name, last_name, company, email')
        .eq('workspace_id', member.workspace_id)
        .in('id', leadIds)

      leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]))
    }

    const followUpsDetailed = followUps.map((f) => ({
      ...f,
      lead: leadMap.get(f.lead_id) ?? null,
    }))

    const callsDetailed = calls.map((c) => ({
      ...c,
      lead: c.lead_id ? (leadMap.get(c.lead_id) ?? null) : null,
    }))

    return NextResponse.json({
      followUps: followUpsDetailed,
      calls: callsDetailed,
    })
  } catch (err) {
    console.error('[GET /api/analytics/reps/[id]]', err)
    return NextResponse.json({ error: 'Failed to load rep detail' }, { status: 500 })
  }
}
