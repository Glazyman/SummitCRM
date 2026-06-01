/**
 * GET  /api/tasks  — list follow-ups + callbacks for workspace
 * POST /api/tasks  — create a new task
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

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCtx()
    if (!ctx) return apiUnauthorized()
    const { member, admin } = ctx
    const { searchParams } = new URL(request.url)
    const type       = searchParams.get('type')      // follow_up | callback
    const priority   = searchParams.get('priority')  // high | medium | low
    const assignedTo = searchParams.get('assigned_to')
    const done       = searchParams.get('done')      // 'true' | 'false'

    let query = (admin as any)
      .from('follow_ups')
      .select(`
        id, type, priority, title, notes, due_at, completed_at,
        assigned_to, created_at,
        lead:leads (
          id, first_name, last_name, email, phone, company
        )
      `)
      .eq('workspace_id', member.workspace_id)
      .order('due_at', { ascending: true })

    if (type)       query = query.eq('type', type)
    if (priority)   query = query.eq('priority', priority)
    if (member.role === 'rep') {
      query = query.eq('assigned_to', ctx.user.id)
    } else if (assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }
    if (done === 'true')  query = query.not('completed_at', 'is', null)
    if (done === 'false') query = query.is('completed_at', null)

    const { data, error } = await query
    if (error) return apiServerError(error)

    return apiSuccess({ activities: data ?? [] })
  } catch (err) {
    return apiServerError(err)
  }
}

const createSchema = z.object({
  leadId:     z.string().uuid(),
  type:       z.enum(['follow_up', 'callback']).default('follow_up'),
  priority:   z.enum(['high', 'medium', 'low']).default('medium'),
  title:      z.string().min(1).max(200),
  notes:      z.string().max(2000).optional(),
  dueAt:      z.string().datetime(),
  assignedTo: z.string().uuid().optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCtx()
    if (!ctx) return apiUnauthorized()
    const { user, member, admin } = ctx

    let body: unknown
    try { body = await request.json() } catch { return apiError('Invalid JSON') }
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message)

    const { leadId, type, priority, title, notes, dueAt, assignedTo } = parsed.data

    const effectiveAssignedTo = assignedTo ?? user.id
    if (member.role === 'rep' && effectiveAssignedTo !== user.id) {
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

    const { data: lead } = await (admin as any)
      .from('leads')
      .select('id, assigned_to')
      .eq('id', leadId)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .single()
    if (!lead) return apiError('Lead not found', 404)
    if (member.role === 'rep' && lead.assigned_to !== user.id) {
      return apiError('Insufficient permissions for this lead', 403)
    }

    const { data, error } = await (admin as any)
      .from('follow_ups')
      .insert({
        workspace_id: member.workspace_id,
        lead_id:      leadId,
        assigned_to:  effectiveAssignedTo,
        type,
        priority,
        title,
        notes:        notes ?? null,
        due_at:       dueAt,
      })
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    if (error || !data) return apiServerError(error)
    return apiSuccess({ id: data.id }, 201)
  } catch (err) {
    return apiServerError(err)
  }
}
