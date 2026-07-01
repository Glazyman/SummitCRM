import { NextRequest, NextResponse } from 'next/server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'
import type { LeadStatus, CallOutcome } from '@/types/database'

const STATUS_TO_CALL_OUTCOME: Partial<Record<LeadStatus, CallOutcome>> = {
  called:       'answered',
  voicemail:    'voicemail',
  no_answer:    'no_answer',
  wrong_number: 'wrong_number',
  sold_already: 'answered',
}

interface FilterSpec {
  search?:              string | null
  statuses?:            string[] | null
  interests?:           string[] | null
  batch_id?:            string | null
  assigned_to?:         string | null
  assigned_unassigned?: boolean
  my_leads?:            boolean
  cold_only?:           boolean
  date_from?:           string | null
  date_to?:             string | null
}

async function getContext() {
  // Effective actor: bulk ops are admin-gated, so an admin viewing-as a rep is
  // (correctly) blocked; an admin viewing-as another admin acts as them.
  const actor = await getActor()
  if (!actor) return null
  return {
    user: { id: actor.userId },
    member: { workspace_id: actor.workspaceId, role: actor.role },
    admin: createAdminClient(),
  }
}

// PATCH /api/leads/bulk — bulk update (status, assigned_to, batch_id).
// Accepts EITHER { ids: [...] } OR { scope: 'all_matching', filter: {...} }.
export async function PATCH(req: NextRequest) {
  const ctx = await getContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, member, admin } = ctx

  if (!['admin', 'super_admin'].includes(member.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { ids, scope, filter, status, assigned_to, batch_id } = body as {
    ids?: string[]; scope?: 'all_matching'; filter?: FilterSpec
    status?: LeadStatus; assigned_to?: string | null; batch_id?: string | null
  }

  if (status === undefined && assigned_to === undefined && batch_id === undefined)
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  let effectiveIds: string[]

  if (scope === 'all_matching') {
    const f = filter ?? {}
    const isRep = member.role === 'rep'
    const { data: result, error } = await (admin as any).rpc('bulk_update_leads_by_filter', {
      p_workspace_id:        member.workspace_id,
      p_viewer_id:           user.id,
      p_scope_to_rep:        isRep,
      p_search:              f.search ?? null,
      p_statuses:            f.statuses ?? null,
      p_interests:           f.interests ?? null,
      p_batch_id_filter:     f.batch_id ?? null,
      p_assigned_to_filter:  f.assigned_to ?? null,
      p_assigned_unassigned: !!f.assigned_unassigned,
      p_my_leads:            !!f.my_leads,
      p_cold_only:           !!f.cold_only,
      p_date_from:           f.date_from ?? null,
      p_date_to:             f.date_to ?? null,
      p_new_status:          status ?? null,
      p_new_assigned_to:     assigned_to ?? null,
      p_new_batch_id:        batch_id ?? null,
      p_clear_assigned:      assigned_to === null,
      p_clear_batch:         batch_id === null,
    })
    if (error) {
      console.error('[bulk_update_leads_by_filter]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    effectiveIds = ((result?.ids ?? []) as string[])
  } else {
    if (!Array.isArray(ids) || ids.length === 0)
      return NextResponse.json({ error: 'ids array (or scope: all_matching) is required' }, { status: 400 })

    const { error: rpcErr } = await (admin as any).rpc('bulk_update_leads', {
      p_workspace_id:   member.workspace_id,
      p_ids:            ids,
      p_assigned_to:    assigned_to !== undefined ? (assigned_to || null) : null,
      p_status:         status      !== undefined ? status      : null,
      p_batch_id:       batch_id    !== undefined ? (batch_id   || null) : null,
      // Without these, a null assignee/batch meant "keep current" — so bulk
      // "Unassigned" / "remove from batch" was a silent no-op.
      p_clear_assigned: assigned_to === null,
      p_clear_batch:    batch_id === null,
    })
    if (rpcErr) {
      console.error('[bulk PATCH] rpc error:', rpcErr)
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }
    effectiveIds = ids
  }

  // Log activities + auto-call rows in chunks (per-row, can't fully push down).
  if (status && effectiveIds.length > 0) {
    const CHUNK = 200
    for (let i = 0; i < effectiveIds.length; i += CHUNK) {
      const chunk = effectiveIds.slice(i, i + CHUNK)
      const activityRows = chunk.map((id) => ({
        workspace_id: member.workspace_id,
        lead_id:      id,
        user_id:      user.id,
        type:         'lead_status_changed',
        metadata:     { to: status, bulk: true },
      }))
      await (admin as any).from('activity_logs').insert(activityRows)

      const outcome = STATUS_TO_CALL_OUTCOME[status as LeadStatus]
      if (outcome) {
        // Only auto-log a call for leads with NO existing call log — the first
        // call-status change counts as a call; a later one is treated as a
        // status correction, not a second call (same rule as PATCH /leads/[id]).
        const { data: existingRows } = await (admin as any)
          .from('call_logs')
          .select('lead_id')
          .in('lead_id', chunk)
        const hasCall = new Set(((existingRows ?? []) as Array<{ lead_id: string }>).map((r) => r.lead_id))
        const callRows = chunk
          .filter((id) => !hasCall.has(id))
          .map((id) => ({
            lead_id:      id,
            workspace_id: member.workspace_id,
            logged_by:    user.id,
            outcome,
            duration_sec: null,
            notes:        null,
            called_at:    new Date().toISOString(),
          }))
        if (callRows.length > 0) await (admin as any).from('call_logs').insert(callRows)
      }
    }
  }

  return NextResponse.json({ updated: effectiveIds.length })
}

// DELETE /api/leads/bulk — hard delete. Same two modes.
export async function DELETE(req: NextRequest) {
  const ctx = await getContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, member, admin } = ctx

  if (!['admin', 'super_admin'].includes(member.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { ids, scope, filter } = body as {
    ids?: string[]; scope?: 'all_matching'; filter?: FilterSpec
  }

  if (scope === 'all_matching') {
    const f = filter ?? {}
    const isRep = member.role === 'rep'
    const { data: result, error } = await (admin as any).rpc('bulk_delete_leads_by_filter', {
      p_workspace_id:        member.workspace_id,
      p_viewer_id:           user.id,
      p_scope_to_rep:        isRep,
      p_search:              f.search ?? null,
      p_statuses:            f.statuses ?? null,
      p_interests:           f.interests ?? null,
      p_batch_id_filter:     f.batch_id ?? null,
      p_assigned_to_filter:  f.assigned_to ?? null,
      p_assigned_unassigned: !!f.assigned_unassigned,
      p_my_leads:            !!f.my_leads,
      p_cold_only:           !!f.cold_only,
      p_date_from:           f.date_from ?? null,
      p_date_to:             f.date_to ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: Number(result?.count ?? 0) })
  }

  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids array (or scope: all_matching) is required' }, { status: 400 })

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
