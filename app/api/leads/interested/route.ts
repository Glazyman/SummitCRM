/**
 * GET /api/leads/interested?start=ISO&end=ISO[&rep=userId]
 *
 * Leads that were MARKED interested inside [start, end) — admin only. Source
 * is the `interest_status_changed` activity log (written by PATCH
 * /api/leads/[id], the only place interest changes), so it answers "who got
 * marked interested that day, and by whom" — not just "who is interested now".
 * One row per lead (its latest marking in the window), newest first.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor } from '@/lib/auth/actor'
import { getUsersById } from '@/lib/users'

export async function GET(req: NextRequest) {
  const actor = await getActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'super_admin'].includes(actor.role))
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end   = searchParams.get('end')
  const rep   = searchParams.get('rep')
  if (!start || !end || isNaN(Date.parse(start)) || isNaN(Date.parse(end)))
    return NextResponse.json({ error: 'start and end are required ISO timestamps' }, { status: 400 })

  const admin = createAdminClient()
  let q = (admin as any)
    .from('activity_logs')
    .select('created_at, user_id, lead:leads(id, first_name, last_name, company, phone, interest_status, assigned_to, deleted_at)')
    .eq('workspace_id', actor.workspaceId)
    .eq('type', 'interest_status_changed')
    .eq('metadata->>to', 'interested')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (rep) q = q.eq('user_id', rep)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    created_at: string; user_id: string | null
    lead: {
      id: string; first_name: string | null; last_name: string | null; company: string | null
      phone: string | null; interest_status: string; assigned_to: string | null; deleted_at: string | null
    } | null
  }
  const seen = new Set<string>()
  const rows = ((data ?? []) as Row[]).filter((r) => {
    if (!r.lead || r.lead.deleted_at || seen.has(r.lead.id)) return false
    seen.add(r.lead.id)
    return true
  })

  const userIds = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))]
  const names = await getUsersById(admin, actor.workspaceId, userIds)

  return NextResponse.json({
    leads: rows.map((r) => ({
      id:            r.lead!.id,
      name:          [r.lead!.first_name, r.lead!.last_name].filter(Boolean).join(' ') || 'Unnamed lead',
      company:       r.lead!.company,
      phone:         r.lead!.phone,
      // They may have been changed back since — the card flags that.
      stillInterested: r.lead!.interest_status === 'interested',
      markedAt:      r.created_at,
      markedBy:      r.user_id ? names.get(r.user_id) ?? null : null,
    })),
  })
}
