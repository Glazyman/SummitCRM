import { NextRequest, NextResponse } from 'next/server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { LeadStatus } from '@/types/database'
import type { CallOutcome } from '@/types/database'

const STATUS_TO_CALL_OUTCOME: Partial<Record<LeadStatus, CallOutcome>> = {
  called:       'answered',
  voicemail:    'voicemail',
  no_answer:    'no_answer',
  wrong_number: 'wrong_number',
  sold_already: 'answered',
}

async function getContext() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) return null
  return { user, member, admin: createAdminClient() }
}

// PATCH /api/leads/bulk — bulk update (status, assigned_to, batch_id)
export async function PATCH(req: NextRequest) {
  const ctx = await getContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, member, admin } = ctx

  if (!['admin', 'super_admin'].includes(member.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { ids, status, assigned_to, batch_id } = body

  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  if (ids.length > 500)
    return NextResponse.json({ error: 'Maximum 500 leads per bulk operation' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status !== undefined)      patch.status      = status as LeadStatus
  if (assigned_to !== undefined) patch.assigned_to = assigned_to || null
  if (batch_id !== undefined)    patch.batch_id    = batch_id || null

  if (Object.keys(patch).length === 1)
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { error } = await admin
    .from('leads')
    .update(patch as never)
    .in('id', ids)
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (status) {
    const activityRows = ids.map((id: string) => ({
      workspace_id: member.workspace_id,
      lead_id:      id,
      user_id:      user.id,
      type:         'lead_status_changed',
      metadata:     { to: status, bulk: true },
    }))
    await admin.from('activity_logs').insert(activityRows as never[])

    const outcome = STATUS_TO_CALL_OUTCOME[status as LeadStatus]
    if (outcome) {
      const callRows = ids.map((id: string) => ({
        lead_id:      id,
        workspace_id: member.workspace_id,
        logged_by:    user.id,
        outcome,
        duration_sec: null,
        notes:        null,
      }))
      await admin.from('call_logs').insert(callRows as never[])

      const callActivities = ids.map((id: string) => ({
        workspace_id: member.workspace_id,
        lead_id:      id,
        user_id:      user.id,
        type:         'call_logged',
        metadata:     { outcome, duration_sec: null, auto_logged: true, bulk: true },
      }))
      await admin.from('activity_logs').insert(callActivities as never[])
    }
  }

  return NextResponse.json({ updated: ids.length })
}

// DELETE /api/leads/bulk — bulk hard delete
export async function DELETE(req: NextRequest) {
  const ctx = await getContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { member, admin } = ctx

  if (!['admin', 'super_admin'].includes(member.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { ids } = body
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  if (ids.length > 200)
    return NextResponse.json({ error: 'Maximum 200 leads per bulk delete' }, { status: 400 })

  const { error } = await admin
    .from('leads')
    .delete()
    .in('id', ids)
    .eq('workspace_id', member.workspace_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: ids.length })
}
