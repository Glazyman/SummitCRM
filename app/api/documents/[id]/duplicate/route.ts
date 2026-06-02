/**
 * POST /api/documents/[id]/duplicate
 *
 * Copies the stored file to a new object and inserts a new "Copy of …" row.
 * Admin only.
 */
import { NextRequest } from 'next/server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireDocumentAdmin, loadDocument, DOCUMENTS_BUCKET } from '@/lib/documents/context'
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/utils/api'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireDocumentAdmin()
    if ('error' in ctx) return ctx.error
    const { user, admin, workspaceId } = ctx
    const { id } = await params

    const doc = await loadDocument(admin, workspaceId, id)
    if (!doc) return apiNotFound('Document')

    const ext = doc.file_path.includes('.') ? '.' + doc.file_path.split('.').pop() : ''
    const newPath = `${workspaceId}/${crypto.randomUUID()}${ext}`

    const { error: copyErr } = await admin.storage.from(DOCUMENTS_BUCKET).copy(doc.file_path, newPath)
    if (copyErr) return apiServerError(copyErr)

    const { data: row, error } = await (admin as any)
      .from('documents')
      .insert({
        workspace_id: workspaceId,
        name: `Copy of ${doc.name}`.slice(0, 255),
        description: doc.description,
        file_path: newPath,
        mime_type: doc.mime_type,
        size_bytes: doc.size_bytes,
        uploaded_by: user.id,
      })
      .select('id, name, description, file_path, mime_type, size_bytes, uploaded_by, created_at')
      .single() as { data: any; error: unknown }

    if (error || !row) {
      await admin.storage.from(DOCUMENTS_BUCKET).remove([newPath])
      return apiServerError(error)
    }
    return apiSuccess({ ...row, uploaded_by_name: null }, 201)
  } catch (err) {
    return apiServerError(err)
  }
}
