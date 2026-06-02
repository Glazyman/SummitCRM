/**
 * /api/documents
 *
 *   GET  — list the workspace's documents (admin only), newest first,
 *          with the uploader's display name.
 *   POST — upload a file (multipart/form-data). Streams the bytes to the
 *          private 'documents' storage bucket via the service role, then
 *          records a row in public.documents.
 *
 * Auth: admin+ only (the documents library is an admin feature).
 */
import { NextRequest } from 'next/server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUsersById } from '@/lib/users'
import { apiSuccess, apiError, apiUnauthorized, apiForbidden, apiServerError } from '@/lib/utils/api'

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB — matches the bucket file_size_limit
const BUCKET = 'documents'

/** Resolve the caller's active workspace + role, gating on admin+. */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: apiUnauthorized() }

  const admin = createAdminClient()
  const { data: member } = await (admin as any)
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null }

  if (!member) return { error: apiForbidden('User is not an active member of any workspace') }
  if (!['admin', 'super_admin'].includes(member.role)) {
    return { error: apiForbidden() }
  }
  return { user, admin, workspaceId: member.workspace_id }
}

export async function GET() {
  try {
    const ctx = await requireAdmin()
    if ('error' in ctx) return ctx.error
    const { admin, workspaceId } = ctx

    const { data: docs, error } = await (admin as any)
      .from('documents')
      .select('id, name, description, file_path, mime_type, size_bytes, uploaded_by, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }) as {
        data: Array<{
          id: string; name: string; description: string | null; file_path: string
          mime_type: string | null; size_bytes: number | null; uploaded_by: string | null; created_at: string
        }> | null
        error: unknown
      }

    if (error) return apiServerError(error)

    const uploaderIds = [...new Set((docs ?? []).map((d) => d.uploaded_by).filter(Boolean) as string[])]
    const names = await getUsersById(admin, workspaceId, uploaderIds)

    return apiSuccess(
      (docs ?? []).map((d) => ({
        ...d,
        uploaded_by_name: d.uploaded_by ? (names.get(d.uploaded_by) ?? null) : null,
      })),
    )
  } catch (err) {
    return apiServerError(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdmin()
    if ('error' in ctx) return ctx.error
    const { user, admin, workspaceId } = ctx

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return apiError('Expected multipart/form-data')
    }

    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return apiError('No file provided')
    if (file.size > MAX_BYTES) return apiError('File exceeds the 25 MB limit')

    const rawName = (form.get('name') as string | null)?.trim() || file.name
    const name = rawName.slice(0, 255)
    const description = ((form.get('description') as string | null)?.trim() || null)?.slice(0, 2000) ?? null

    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin'
    const objectId = crypto.randomUUID()
    const filePath = `${workspaceId}/${objectId}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(filePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (uploadErr) return apiServerError(uploadErr)

    const { data: row, error: insertErr } = await (admin as any)
      .from('documents')
      .insert({
        workspace_id: workspaceId,
        name,
        description,
        file_path: filePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user.id,
      })
      .select('id, name, description, file_path, mime_type, size_bytes, uploaded_by, created_at')
      .single() as { data: any; error: unknown }

    if (insertErr || !row) {
      // Roll back the orphaned object so storage doesn't drift from the table.
      await admin.storage.from(BUCKET).remove([filePath])
      return apiServerError(insertErr)
    }

    return apiSuccess({ ...row, uploaded_by_name: null }, 201)
  } catch (err) {
    return apiServerError(err)
  }
}
