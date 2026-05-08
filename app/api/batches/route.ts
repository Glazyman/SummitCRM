/**
 * GET  /api/batches — list all batches for the workspace
 * POST /api/batches — create a new batch
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'

async function getWorkspaceMember() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const admin = createAdminClient()
  const { data: member } = await (admin as any)
    .from('workspace_members')
    .select('workspace_id, role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null }

  if (!member) return null
  return { user, member, admin }
}

export async function GET() {
  try {
    const ctx = await getWorkspaceMember()
    if (!ctx) return apiUnauthorized()

    const { member, admin } = ctx

    const { data, error } = await (admin as any)
      .from('lead_batches')
      .select('id, name, created_at')
      .eq('workspace_id', member.workspace_id)
      .order('created_at', { ascending: false }) as {
        data: Array<{ id: string; name: string; created_at: string }> | null
        error: unknown
      }

    if (error) return apiServerError(error)

    const batches = (data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      leadCount: 0,
      createdAt: b.created_at,
    }))

    return apiSuccess({ batches })
  } catch (err) {
    return apiServerError(err)
  }
}

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
})

export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceMember()
    if (!ctx) return apiUnauthorized()

    const { user, member, admin } = ctx

    if (!['super_admin', 'admin', 'manager', 'rep'].includes(member.role)) {
      return apiError('Insufficient permissions', 403)
    }

    let body: unknown
    try { body = await request.json() } catch { return apiError('Invalid JSON') }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message)

    const { data: batch, error } = await (admin as any)
      .from('lead_batches')
      .insert({
        workspace_id: member.workspace_id,
        created_by:   user.id,
        name:         parsed.data.name,
      })
      .select('id, name')
      .single() as { data: { id: string; name: string } | null; error: unknown }

    if (error || !batch) return apiServerError(error)

    return apiSuccess({ id: batch.id, name: batch.name, leadCount: 0 }, 201)
  } catch (err) {
    return apiServerError(err)
  }
}
