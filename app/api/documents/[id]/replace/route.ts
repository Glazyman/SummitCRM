/**
 * POST /api/documents/[id]/replace
 *
 * Replaces the stored file with a newly-uploaded version (multipart/form-data
 * `file`). Uploads to a fresh object, repoints the row, then removes the old
 * object. The document's name/description are untouched. Admin only.
 */
import { NextRequest } from 'next/server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireDocumentAdmin, loadDocument, DOCUMENTS_BUCKET } from '@/lib/documents/context'
import { apiSuccess, apiError, apiNotFound, apiServerError } from '@/lib/utils/api'

const MAX_BYTES = 25 * 1024 * 1024
type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireDocumentAdmin()
    if ('error' in ctx) return ctx.error
    const { admin, workspaceId } = ctx
    const { id } = await params

    const doc = await loadDocument(admin, workspaceId, id)
    if (!doc) return apiNotFound('Document')

    let form: FormData
    try { form = await request.formData() } catch { return apiError('Expected multipart/form-data') }

    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return apiError('No file provided')
    if (file.size > MAX_BYTES) return apiError('File exceeds the 25 MB limit')

    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin'
    const newPath = `${workspaceId}/${crypto.randomUUID()}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(newPath, bytes, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (uploadErr) return apiServerError(uploadErr)

    const { data: row, error } = await (admin as any)
      .from('documents')
      .update({ file_path: newPath, mime_type: file.type || null, size_bytes: file.size })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('id, name, description, file_path, mime_type, size_bytes, uploaded_by, created_at')
      .single() as { data: any; error: unknown }

    if (error || !row) {
      await admin.storage.from(DOCUMENTS_BUCKET).remove([newPath])
      return apiServerError(error)
    }

    // Old object no longer referenced — best-effort cleanup.
    if (doc.file_path !== newPath) await admin.storage.from(DOCUMENTS_BUCKET).remove([doc.file_path])

    return apiSuccess(row)
  } catch (err) {
    return apiServerError(err)
  }
}
