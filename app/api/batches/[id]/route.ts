/**
 * PATCH /api/batches/[id] — rename a batch (updates `lead_batches.name` for all leads in that batch)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'

const patchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id: batchId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiUnauthorized()

    const admin = createAdminClient()
    const { data: memberRow } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    const member = memberRow as { workspace_id: string; role: string } | null

    if (!member) return apiUnauthorized()
    if (!['admin', 'super_admin'].includes(member.role)) {
      return apiError('Only admins can rename batches', 403)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('Invalid JSON')
    }
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message)

    const name = parsed.data.name

    const { data: row, error: fetchErr } = await (admin as any)
      .from('lead_batches')
      .select('id')
      .eq('id', batchId)
      .eq('workspace_id', member.workspace_id)
      .single()

    if (fetchErr || !row) return apiError('Batch not found', 404)

    const { data: updated, error: updErr } = await (admin as any)
      .from('lead_batches')
      .update({ name })
      .eq('id', batchId)
      .eq('workspace_id', member.workspace_id)
      .select('id, name')
      .single()

    if (updErr || !updated) return apiServerError(updErr)

    return apiSuccess({ batch: updated })
  } catch (err) {
    return apiServerError(err)
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id: batchId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiUnauthorized()

    const admin = createAdminClient()
    const { data: memberRow } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    const member = memberRow as { workspace_id: string; role: string } | null

    if (!member) return apiUnauthorized()
    if (!['admin', 'super_admin'].includes(member.role)) {
      return apiError('Only admins can delete batches', 403)
    }

    const { data: row } = await (admin as any)
      .from('lead_batches')
      .select('id')
      .eq('id', batchId)
      .eq('workspace_id', member.workspace_id)
      .single()
    if (!row) return apiError('Batch not found', 404)

    await (admin as any)
      .from('leads')
      .delete()
      .eq('workspace_id', member.workspace_id)
      .eq('batch_id', batchId)

    const { error: delErr } = await (admin as any)
      .from('lead_batches')
      .delete()
      .eq('id', batchId)
      .eq('workspace_id', member.workspace_id)

    if (delErr) return apiServerError(delErr)
    return apiSuccess({ deleted: true })
  } catch (err) {
    return apiServerError(err)
  }
}
