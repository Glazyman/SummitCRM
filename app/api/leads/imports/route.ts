/**
 * GET /api/leads/imports
 *
 * Paginated list of past import jobs for the current workspace.
 * Supports ?page=1&limit=20 query params.
 *
 * Auth: rep+
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'

const deleteImportSchema = z.object({
  import_id: z.string().uuid(),
})

export async function GET(request: NextRequest) {
  try {
    // ── Auth ───────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiUnauthorized()

    const admin = createAdminClient()
    const { data: member, error: memberErr } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (memberErr || !member) {
      return apiError('User is not an active member of any workspace', 403)
    }

    const workspaceId = member.workspace_id
    const role        = member.role

    if (!['super_admin', 'admin', 'rep'].includes(role)) {
      return apiError('Insufficient permissions', 403)
    }

    // ── Pagination ─────────────────────────────────────────────────────
    const url    = new URL(request.url)
    const page   = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10))
    const limit  = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))
    const offset = (page - 1) * limit

    // ── Query ──────────────────────────────────────────────────────────
    // RLS parity: reps see only their imports; manager+ see all workspace imports
    const seesAllImports = ['super_admin', 'admin'].includes(role)

    const baseQuery = admin
      .from('lead_imports')
      .select(`
        id,
        status,
        file_name,
        total_rows,
        imported_rows,
        failed_rows,
        field_mapping,
        storage_path,
        created_at,
        completed_at,
        created_by,
        batch_id,
        lead_batches ( id, name, lead_count )
      `, { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const query = seesAllImports
      ? baseQuery
      : baseQuery.eq('created_by', user.id)

    const { data: records, error, count } = await query as {
      data: ImportListRow[] | null
      error: unknown
      count: number | null
    }

    if (error) return apiServerError(error)

    const totalCount = count ?? 0
    const totalPages = Math.ceil(totalCount / limit)

    const items = (records ?? []).map((r) => ({
      id:           r.id,
      fileName:     r.file_name,
      status:       r.status,
      totalRows:    r.total_rows,
      importedRows: r.imported_rows,
      failedRows:   r.failed_rows,
      batch:        r.lead_batches ?? null,
      createdBy:    r.created_by,
      createdAt:    r.created_at,
      completedAt:  r.completed_at,
      hasErrors:    (r.failed_rows ?? 0) > 0,
      successRate:
        r.total_rows > 0
          ? Math.round((r.imported_rows / r.total_rows) * 100)
          : 0,
    }))

    return apiSuccess({
      items,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage:     page < totalPages,
        hasPreviousPage: page > 1,
      },
    })
  } catch (err) {
    return apiServerError(err)
  }
}

/**
 * DELETE /api/leads/imports
 *
 * Deletes one import history record for the current workspace.
 *
 * Auth: admin+
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiUnauthorized()

    const admin = createAdminClient()
    const { data: member, error: memberErr } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (memberErr || !member) {
      return apiError('User is not an active member of any workspace', 403)
    }

    if (!['super_admin', 'admin'].includes(member.role)) {
      return apiError('Only admins can delete import history', 403)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('Invalid JSON body')
    }

    const parsed = deleteImportSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message)

    const { import_id: importId } = parsed.data

    const { data: target, error: targetErr } = await admin
      .from('lead_imports')
      .select('id, workspace_id, storage_path')
      .eq('id', importId)
      .single() as {
      data: { id: string; workspace_id: string; storage_path: string | null } | null
      error: unknown
    }

    if (targetErr || !target) {
      return apiError('Import not found', 404)
    }

    if (target.workspace_id !== member.workspace_id) {
      return apiError('Import not found in your workspace', 404)
    }

    if (target.storage_path) {
      await admin.storage.from('lead-imports').remove([target.storage_path])
    }

    const { error: delErr } = await admin
      .from('lead_imports')
      .delete()
      .eq('id', importId)

    if (delErr) return apiServerError(delErr)

    return apiSuccess({ deleted: true })
  } catch (err) {
    return apiServerError(err)
  }
}

// ── Private types ─────────────────────────────────────────────────────────
interface ImportListRow {
  id:            string
  file_name:     string
  status:        string
  total_rows:    number
  imported_rows: number
  failed_rows:   number
  field_mapping: Record<string, string>
  storage_path:  string | null
  created_at:    string
  completed_at:  string | null
  created_by:    string
  batch_id:      string | null
  lead_batches:  { id: string; name: string; lead_count: number } | null
}
