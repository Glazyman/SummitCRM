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

  if (status === undefined && assigned_to === undefined && batch_id === undefined)
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  // Use a PostgreSQL function instead of .in() to avoid PostgREST URL length
  // limits that cause 400 errors when updating thousands of leads at once.
  const { data: updatedCount, error: rpcErr } = await (admin as any).rpc('bulk_update_leads', {
    p_workspace_id: member.workspace_id,
    p_ids:          ids,
    p_assigned_to:  assigned_to !== undefined ? (assigned_to || null) : null,
    p_status:       status      !== undefined ? status      : null,
    p_batch_id:     batch_id    !== undefined ? (batch_id   || null) : null,
  })

  if (rpcErr) {
    console.error('[bulk PATCH] rpc error:', rpcErr)
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  if (status) {
    // Log activity for status changes (in chunks to avoid URL limits)
    const CHUNK = 200
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const activityRows = chunk.map((id: string) => ({
        workspace_id: member.workspace_id,
        lead_id:      id,
        user_id:      user.id,
        type:         'lead_status_changed',
        metadata:     { to: status, bulk: true },
      }))
      await (admin as any).from('activity_logs').insert(activityRows)

      const outcome = STATUS_TO_CALL_OUTCOME[status as LeadStatus]
      if (outcome) {
        const callRows = chunk.map((id: string) => ({
          lead_id:      id,
          workspace_id: member.workspace_id,
          logged_by:    user.id,
          outcome,
          duration_sec: null,
          notes:        null,
          called_at:    new Date().toISOString(),
        }))
        await (admin as any).from('call_logs').insert(callRows)
      }
    }
  }

  return NextResponse.json({ updated: updatedCount ?? ids.length })
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

  // Delete in small chunks — 100 IDs max keeps the URL under typical limits
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error } = await (admin as any)
      .from('leads')
      .delete()
      .in('id', chunk)
      .eq('workspace_id', member.workspace_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: ids.length })
}
