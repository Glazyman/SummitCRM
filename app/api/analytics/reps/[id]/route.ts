/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: repId } = await params
    const start = req.nextUrl.searchParams.get('start')
    const end = req.nextUrl.searchParams.get('end')

    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: member } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 })
    }

    let callsQuery = (admin as any)
      .from('call_logs')
      .select('id, lead_id, outcome, notes, called_at')
      .eq('workspace_id', member.workspace_id)
      .eq('logged_by', repId)
      .order('called_at', { ascending: false })
      .limit(200)

    if (start) callsQuery = callsQuery.gte('called_at', start)
    if (end) callsQuery = callsQuery.lte('called_at', end)

    let followUpsQuery = (admin as any)
      .from('follow_ups')
      .select('id, lead_id, title, notes, due_at, completed_at, created_at')
      .eq('workspace_id', member.workspace_id)
      .eq('assigned_to', repId)
      .order('due_at', { ascending: true })
      .limit(500)

    if (start) followUpsQuery = followUpsQuery.gte('created_at', start)
    if (end) followUpsQuery = followUpsQuery.lte('created_at', end)

    const [callsRes, fuRes] = await Promise.all([callsQuery, followUpsQuery])

    const calls = (callsRes.data ?? []) as Array<{ id: string; lead_id: string | null; outcome: string; notes: string | null; called_at: string }>
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
