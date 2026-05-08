/**
 * POST /api/leads/import/start
 *
 * Accepts pre-parsed row data from the client, runs the full import pipeline,
 * and returns the final result synchronously.
 *
 * This approach works for up to ~5 000 rows within Vercel's function timeout.
 * For larger batches the Edge Function should be used instead (see /api/leads/import/queue).
 *
 * Auth: rep+
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient }         from '@/lib/supabase/server'
import { createAdminClient }    from '@/lib/supabase/admin'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'
import { processImport }        from '@/lib/import/processor'
import { MAX_ROWS_PER_IMPORT }  from '@/lib/import/validator'
import { preflightCheck }       from '@/lib/import/validator'
import { findEmailColumn }      from '@/lib/import/mapper'
import { auditLog }             from '@/lib/security/audit'

// ── Request schema ─────────────────────────────────────────────────────────
const fieldMappingSchema = z.record(
  z.string(),
  z.enum(['full_name', 'first_name', 'last_name',
          'email', 'email_2', 'email_3',
          'phone', 'phone_2', 'phone_3', 'company_phone',
          'title', 'company', 'contact_state', 'website', 'linkedin_url',
          'custom', 'ignore'] as const)
)

const startImportSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, 'No rows provided')
    .max(MAX_ROWS_PER_IMPORT, `Maximum ${MAX_ROWS_PER_IMPORT} rows per import`),

  mapping: fieldMappingSchema,

  customFieldNames: z.record(z.string(), z.string()).optional().default({}),

  batchId: z.string().uuid().nullable().optional().default(null),

  newBatchName: z.string().max(200).default(''),

  duplicateMode: z.enum(['skip', 'update']).default('skip'),

  assignedTo: z.string().uuid().nullable().optional().default(null),

  fileName: z.string().max(255).optional().default('import.csv'),
})

// ── Handler ────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── Auth ───────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) return apiUnauthorized()

    // Verify workspace membership from DB (not JWT claims — claims can lag or be stale)
    const admin = createAdminClient()
    const { data: member, error: memberErr } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string; is_active: boolean } | null; error: unknown }

    if (memberErr || !member) {
      return apiError('User is not an active member of any workspace', 403)
    }

    const workspaceId = member.workspace_id
    const role        = member.role

    if (!['super_admin', 'admin', 'rep'].includes(role)) {
      return apiError('Insufficient permissions — rep role or above required', 403)
    }

    // ── Parse & validate body ──────────────────────────────────────────
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('Invalid JSON body')
    }

    const parsed = startImportSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message)
    }

    const { rows: rawRows, mapping, customFieldNames, batchId, newBatchName, duplicateMode, assignedTo, fileName } = parsed.data

    // Coerce row values to strings (client sends Record<string, string> but JSON typing loses that)
    const rows: Record<string, string>[] = rawRows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))
    )

    // ── Preflight check ─────────────────────────────────────────────────
    const emailColumn = findEmailColumn(mapping) ?? undefined // may be undefined — email is optional
    const preflight = preflightCheck(rows, emailColumn)
    if (!preflight.ok) {
      return apiError(preflight.reason ?? 'Preflight check failed')
    }

    // Batch is optional. If none chosen, use a short neutral default (not the CSV filename);
    // users rename batches on the lead profile or batch list.
    let effectiveBatchName = newBatchName.trim()
    if (!batchId && !effectiveBatchName) {
      const when = new Date()
      effectiveBatchName = `Import — ${when.toLocaleString(undefined, {
        month:  'short',
        day:    'numeric',
        year:   'numeric',
        hour:   'numeric',
        minute: '2-digit',
      })}`
    }

    // ── Create lead_imports record ──────────────────────────────────────

    const { data: importRecord, error: importErr } = await admin
      .from('lead_imports')
      .insert({
        workspace_id:  workspaceId,
        created_by:    user.id,
        file_name:     fileName,
        storage_path:  `${workspaceId}/inline`,
        status:        'processing',
        total_rows:    rows.length,
        imported_rows: 0,
        failed_rows:   0,
        field_mapping: mapping,
        error_log:     [],
      } as never)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    if (importErr || !importRecord) {
      return apiServerError(importErr)
    }

    const importId = importRecord.id

    // ── Run processing pipeline ─────────────────────────────────────────
    const result = await processImport({
      importId,
      workspaceId,
      userId:           user.id,
      rows,
      mapping,
      customFieldNames: customFieldNames ?? {},
      batchId:          batchId ?? null,
      newBatchName:     effectiveBatchName,
      duplicateMode,
      assignedTo:       assignedTo ?? null,
      supabase:         admin,
    })

    auditLog({
      workspaceId:  workspaceId,
      actorId:      user.id,
      action:       'lead_import',
      resourceType: 'lead_import',
      resourceId:   importId,
      metadata:     { rows: rows.length, imported: result.imported, failed: result.failed },
      request,
    })

    return apiSuccess(result, 200)
  } catch (err) {
    return apiServerError(err)
  }
}
