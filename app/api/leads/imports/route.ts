/**
 * GET /api/leads/imports
 *
 * Paginated list of past import jobs for the current workspace.
 * Supports ?page=1&limit=20 query params.
 *
 * Auth: rep+
 */
import { NextRequest } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'

export async function GET(request: NextRequest) {
  try {
    // ── Auth ───────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiUnauthorized()

    const claims      = user.app_metadata as { workspace_id?: string; workspace_role?: string }
    const workspaceId = claims.workspace_id
    const role        = claims.workspace_role

    if (!workspaceId) return apiError('Not a workspace member', 403)
    if (!role || !['super_admin', 'admin', 'manager', 'rep'].includes(role)) {
      return apiError('Insufficient permissions', 403)
    }

    // ── Pagination ─────────────────────────────────────────────────────
    const url    = new URL(request.url)
    const page   = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10))
    const limit  = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))
    const offset = (page - 1) * limit

    // ── Query ──────────────────────────────────────────────────────────
    const admin = createAdminClient()

    // Managers and reps only see their own imports; admins see all
    const isAdmin = ['super_admin', 'admin', 'manager'].includes(role)

    const baseQuery = admin
      .from('lead_imports')
      .select(`
        id,
        status,
        total_rows,
        imported_rows,
        failed_rows,
        field_mapping,
        storage_path,
        created_at,
        updated_at,
        imported_by,
        lead_batches ( id, name, lead_count )
      `, { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const query = isAdmin
      ? baseQuery
      : baseQuery.eq('imported_by', user.id)

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
      status:       r.status,
      totalRows:    r.total_rows,
      importedRows: r.imported_rows,
      failedRows:   r.failed_rows,
      batch:        r.lead_batches ?? null,
      importedBy:   r.imported_by,
      createdAt:    r.created_at,
      updatedAt:    r.updated_at,
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

// ── Private types ─────────────────────────────────────────────────────────
interface ImportListRow {
  id:            string
  status:        string
  total_rows:    number
  imported_rows: number
  failed_rows:   number
  field_mapping: Record<string, string>
  storage_path:  string | null
  created_at:    string
  updated_at:    string
  imported_by:   string
  lead_batches:  { id: string; name: string; lead_count: number } | null
}
