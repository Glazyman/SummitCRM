/**
 * GET /api/leads/import/[id]
 *
 * Poll a single import job's status and progress counters.
 * Used by the client during async processing to update the progress bar.
 *
 * Auth: rep+, must belong to same workspace
 */
import { NextRequest } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiSuccess, apiError, apiUnauthorized, apiNotFound, apiServerError } from '@/lib/utils/api'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: importId } = await context.params

    if (!importId) return apiError('Import ID is required')

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

    // ── Fetch import record ────────────────────────────────────────────
    const { data: record, error } = await admin
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
        workspace_id,
        created_by,
        batch_id,
        lead_batches ( id, name )
      `)
      .eq('id', importId)
      .single() as { data: ImportRecord | null; error: unknown }

    if (error || !record) return apiNotFound('Import')

    // Enforce workspace isolation
    if (record.workspace_id !== workspaceId) return apiError('Forbidden', 403)
    if (member.role === 'rep' && record.created_by !== user.id) {
      return apiError('Forbidden', 403)
    }

    // Strip error_log from status poll (fetch via /errors endpoint instead)
    return apiSuccess({
      id:           record.id,
      fileName:     record.file_name,
      status:       record.status,
      totalRows:    record.total_rows,
      importedRows: record.imported_rows,
      failedRows:   record.failed_rows,
      fieldMapping: record.field_mapping,
      storagePath:  record.storage_path,
      batch:        record.lead_batches ?? null,
      createdAt:    record.created_at,
      completedAt:  record.completed_at,
    })
  } catch (err) {
    return apiServerError(err)
  }
}

// ── Private types ─────────────────────────────────────────────────────────
interface ImportRecord {
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
  workspace_id:  string
  created_by:    string
  batch_id:      string | null
  lead_batches:  { id: string; name: string } | null
}
