/**
 * PATCH  /api/tasks/bulk  — update many tasks at once (done/open, priority,
 *                            type, assignee, per-task due dates)
 * DELETE /api/tasks/bulk  — delete many tasks
 *
 * Reps can only touch their own tasks: ids they don't own are silently
 * skipped (the same rows the list never shows them anyway).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor } from '@/lib/auth/actor'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'

async function getCtx() {
  const actor = await getActor()
  if (!actor) return null
  const admin = createAdminClient()
  return {
    user: { id: actor.userId },
    member: { workspace_id: actor.workspaceId, role: actor.role },
    admin,
  }
}

const ids = z.array(z.string().uuid()).min(1).max(500)

const patchSchema = z.object({
  ids,
  completed:  z.boolean().optional(),
  priority:   z.enum(['high', 'medium', 'low']).optional(),
  type:       z.enum(['follow_up', 'callback']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  // Rescheduling keeps each task's own time of day, so every task gets its
  // own due date — computed client-side in the user's timezone.
  dueAts:     z.record(z.string().uuid(), z.string().datetime()).optional(),
})

/** The subset of `ids` this actor may modify. */
async function allowedIds(ctx: NonNullable<Awaited<ReturnType<typeof getCtx>>>, requested: string[]) {
  let q = (ctx.admin as any)
    .from('follow_ups')
    .select('id')
    .eq('workspace_id', ctx.member.workspace_id)
    .in('id', requested)
  if (ctx.member.role === 'rep') q = q.eq('assigned_to', ctx.user.id)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getCtx()
    if (!ctx) return apiUnauthorized()
    const { member, admin } = ctx

    let body: unknown
    try { body = await request.json() } catch { return apiError('Invalid JSON') }
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message)

    const { completed, priority, type, assignedTo, dueAts } = parsed.data
    if (completed === undefined && !priority && !type && assignedTo === undefined && !dueAts) {
      return apiError('No fields to update')
    }

    if (member.role === 'rep' && assignedTo !== undefined && assignedTo !== ctx.user.id) {
      return apiError('Reps can only assign tasks to themselves', 403)
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

    const targetIds = await allowedIds(ctx, parsed.data.ids)
    if (targetIds.length === 0) return apiSuccess({ updated: 0 })

    // Fields shared by every row go out in one statement.
    const shared: Record<string, unknown> = {}
    if (priority)                 shared.priority    = priority
    if (type)                     shared.type        = type
    if (assignedTo !== undefined) shared.assigned_to = assignedTo
    if (completed === false)      shared.completed_at = null

    if (Object.keys(shared).length > 0) {
      const { error } = await (admin as any)
        .from('follow_ups')
        .update(shared)
        .eq('workspace_id', member.workspace_id)
        .in('id', targetIds)
      if (error) return apiServerError(error)
    }

    // Marking done only stamps tasks that are still open, so an already-done
    // task keeps its original completion time.
    if (completed === true) {
      const { error } = await (admin as any)
        .from('follow_ups')
        .update({ completed_at: new Date().toISOString() })
        .eq('workspace_id', member.workspace_id)
        .in('id', targetIds)
        .is('completed_at', null)
      if (error) return apiServerError(error)
    }

    if (dueAts) {
      const allowed = new Set(targetIds)
      const results = await Promise.all(
        Object.entries(dueAts)
          .filter(([id]) => allowed.has(id))
          .map(([id, dueAt]) => (admin as any)
            .from('follow_ups')
            .update({ due_at: dueAt })
            .eq('workspace_id', member.workspace_id)
            .eq('id', id)),
      )
      const failed = results.find((r: { error: unknown }) => r.error)
      if (failed) return apiServerError(failed.error)
    }

    return apiSuccess({ updated: targetIds.length })
  } catch (err) {
    return apiServerError(err)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getCtx()
    if (!ctx) return apiUnauthorized()
    const { member, admin } = ctx

    let body: unknown
    try { body = await request.json() } catch { return apiError('Invalid JSON') }
    const parsed = z.object({ ids }).safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message)

    const targetIds = await allowedIds(ctx, parsed.data.ids)
    if (targetIds.length === 0) return apiSuccess({ deleted: 0 })

    const { error } = await (admin as any)
      .from('follow_ups')
      .delete()
      .eq('workspace_id', member.workspace_id)
      .in('id', targetIds)

    if (error) return apiServerError(error)
    return apiSuccess({ deleted: targetIds.length })
  } catch (err) {
    return apiServerError(err)
  }
}
