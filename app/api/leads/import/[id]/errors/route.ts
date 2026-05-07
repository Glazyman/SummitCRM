/**
 * GET /api/leads/import/[id]/errors
 *
 * Download the error report for a completed or failed import as a CSV file.
 * Streams the response with Content-Disposition: attachment so the browser
 * saves the file directly.
 *
 * Auth: rep+, must belong to same workspace
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiUnauthorized, apiError, apiNotFound } from '@/lib/utils/api'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface ImportError {
  row:    number
  email:  string
  reason: string
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: importId } = await context.params

  if (!importId) return apiError('Import ID is required')

  // ── Auth ─────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return apiUnauthorized()

  const claims      = user.app_metadata as { workspace_id?: string }
  const workspaceId = claims.workspace_id
  if (!workspaceId) return apiError('Not a workspace member', 403)

  // ── Fetch import error_log ───────────────────────────────────────────
  const admin = createAdminClient()

  const { data: record, error } = await admin
    .from('lead_imports')
    .select('id, workspace_id, error_log, status, total_rows, failed_rows, created_at')
    .eq('id', importId)
    .single() as {
      data: {
        id:           string
        workspace_id: string
        error_log:    ImportError[] | null
        status:       string
        total_rows:   number
        failed_rows:  number
        created_at:   string
      } | null
      error: unknown
    }

  if (error || !record) return apiNotFound('Import')
  if (record.workspace_id !== workspaceId) return apiError('Forbidden', 403)

  const errors: ImportError[] = record.error_log ?? []

  if (errors.length === 0) {
    return apiError('No errors found for this import', 404)
  }

  // ── Build CSV ────────────────────────────────────────────────────────
  const csvRows: string[] = [
    // Header
    csvRow(['Row', 'Email', 'Reason']),
    // Data
    ...errors.map((e) => csvRow([String(e.row), e.email ?? '', e.reason ?? ''])),
  ]

  const csvContent = csvRows.join('\r\n')
  const date = new Date(record.created_at).toISOString().split('T')[0]
  const filename = `import-errors-${importId.slice(0, 8)}-${date}.csv`

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':       String(Buffer.byteLength(csvContent, 'utf8')),
      'Cache-Control':       'no-store',
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────
/** Escape a single CSV field value (RFC 4180) */
function csvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Join multiple fields into a CSV row */
function csvRow(fields: string[]): string {
  return fields.map(csvField).join(',')
}
