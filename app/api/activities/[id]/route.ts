/**
 * PATCH  /api/activities/[id]  — update (mark done, change priority, etc.)
 * DELETE /api/activities/[id]  — delete
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const admin = createAdminClient()
  const { data: member } = await (admin as any)
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null }
  if (!member) return null
  return { user, member, admin }
}

const patchSchema = z.object({
  type:        z.enum(['follow_up', 'callback']).optional(),
  priority:    z.enum(['high', 'medium', 'low']).optional(),
  title:       z.string().min(1).max(200).optional(),
  notes:       z.string().max(2000).nullable().optional(),
  dueAt:       z.string().datetime().optional(),
  assignedTo:  z.string().uuid().nullable().optional(),
  completed:   z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getCtx()
    if (!ctx) return apiUnauthorized()
    const { member, admin } = ctx
    const { id } = await params

    let body: unknown
    try { body = await request.json() } catch { return apiError('Invalid JSON') }
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message)

    const { completed, dueAt, assignedTo, ...rest } = parsed.data
    const updates: Record<string, unknown> = { ...rest }
    if (dueAt !== undefined)      updates.due_at      = dueAt
    if (assignedTo !== undefined) updates.assigned_to = assignedTo
    if (completed === true)       updates.completed_at = new Date().toISOString()
    if (completed === false)      updates.completed_at = null

    const { data: existing } = await (admin as any)
      .from('follow_ups')
      .select('id, assigned_to')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single()
    if (!existing) return apiError('Activity not found', 404)
    if (member.role === 'rep' && existing.assigned_to !== ctx.user.id) {
      return apiError('Insufficient permissions', 403)
    }
    if (member.role === 'rep' && assignedTo !== undefined && assignedTo !== ctx.user.id) {
      return apiError('Reps can only assign activities to themselves', 403)
    }
    if (assignedTo) {
      const { data: assignee } = await (admin as any)
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', member.workspace_id)
        .eq('user_id', assignedTo)
        .eq('is_active', true)
        .single()
      if (!assignee) return apiError('Assignee is not an active workspace member', 422)
    }

    const { error } = await (admin as any)
      .from('follow_ups')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)

    if (error) return apiServerError(error)
    return apiSuccess({ id })
  } catch (err) {
    return apiServerError(err)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getCtx()
    if (!ctx) return apiUnauthorized()
    const { member, admin } = ctx
    const { id } = await params

    const { data: existing } = await (admin as any)
      .from('follow_ups')
      .select('id, assigned_to')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single()
    if (!existing) return apiError('Activity not found', 404)
    if (member.role === 'rep' && existing.assigned_to !== ctx.user.id) {
      return apiError('Insufficient permissions', 403)
    }

    const { error } = await (admin as any)
      .from('follow_ups')
      .delete()
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)

    if (error) return apiServerError(error)
    return apiSuccess({ id })
  } catch (err) {
    return apiServerError(err)
  }
}
