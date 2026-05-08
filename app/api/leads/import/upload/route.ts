/**
 * POST /api/leads/import/upload
 *
 * Creates a lead_imports record and returns a Supabase Storage presigned URL
 * for the client to upload the raw file directly (bypasses server memory).
 *
 * After upload, call POST /api/leads/import/queue to trigger async Edge
 * Function processing. This route is intended for large files (> 5 000 rows)
 * where inline processing would time out.
 *
 * Auth: rep+
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'

const uploadSchema = z.object({
  fileName:  z.string().min(1).max(255),
  fileSize:  z.number().int().positive().max(25 * 1024 * 1024), // 25 MB
  mimeType:  z.enum([
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    // Browsers sometimes send these
    'application/csv',
    'application/excel',
    'application/x-csv',
  ]),
  totalRows: z.number().int().positive().max(10_000),
})

export async function POST(request: NextRequest) {
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

    // ── Parse body ─────────────────────────────────────────────────────
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('Invalid JSON body')
    }

    const parsed = uploadSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message)
    }

    const { fileName, fileSize, totalRows } = parsed.data

    // ── Create import record ───────────────────────────────────────────
    const { data: importRecord, error: importErr } = await admin
      .from('lead_imports')
      .insert({
        workspace_id:  workspaceId,
        created_by:    user.id,
        file_name:     fileName,
        storage_path:  `${workspaceId}/pending`,
        status:        'processing',
        total_rows:    totalRows,
        imported_rows: 0,
        failed_rows:   0,
        field_mapping: {},
        error_log:     [],
      } as never)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    if (importErr || !importRecord) return apiServerError(importErr)

    const importId   = importRecord.id
    const ext        = fileName.split('.').pop() ?? 'csv'
    const storagePath = `${workspaceId}/${importId}.${ext}`

    // ── Generate presigned upload URL (60-minute expiry) ───────────────
    const { data: signedUrl, error: signedErr } = await admin.storage
      .from('lead-imports')
      .createSignedUploadUrl(storagePath)

    if (signedErr || !signedUrl) {
      // Clean up the import record since we can't proceed
      await admin.from('lead_imports').delete().eq('id', importId)
      return apiServerError(signedErr)
    }

    // Store the storage path in the import record
    await admin
      .from('lead_imports')
      .update({ storage_path: storagePath } as never)
      .eq('id', importId)

    return apiSuccess({
      importId,
      storagePath,
      uploadUrl:  signedUrl.signedUrl,
      token:      signedUrl.token,
      fileSize,
    })
  } catch (err) {
    return apiServerError(err)
  }
}
