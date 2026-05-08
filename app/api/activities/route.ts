/**
 * GET  /api/activities  — list follow-ups + callbacks for workspace
 * POST /api/activities  — create a new activity
 */
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
    if (assignedTo) query = query.eq('assigned_to', assignedTo)
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

    const { data, error } = await (admin as any)
      .from('follow_ups')
      .insert({
        workspace_id: member.workspace_id,
        lead_id:      leadId,
        assigned_to:  assignedTo ?? user.id,
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
