/**
 * POST /api/documents/[id]/convert
 *
 * Converts a PDF document into an editable .docx (text only, in-house — see
 * lib/documents/pdf-to-docx.ts) and saves it as a NEW document. The original
 * PDF is left untouched. Returns the new row so the client can open the editor.
 *
 * Admin only.
 */
import { NextRequest } from 'next/server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireDocumentAdmin, loadDocument, DOCUMENTS_BUCKET } from '@/lib/documents/context'
import { pdfToDocxBuffer } from '@/lib/documents/pdf-to-docx'
import { apiSuccess, apiError, apiNotFound, apiServerError } from '@/lib/utils/api'

export const runtime = 'nodejs'
export const maxDuration = 60

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
type Params = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireDocumentAdmin()
    if ('error' in ctx) return ctx.error
    const { user, admin, workspaceId } = ctx
    const { id } = await params

    const doc = await loadDocument(admin, workspaceId, id)
    if (!doc) return apiNotFound('Document')

    const ext = (doc.file_path.split('.').pop() ?? '').toLowerCase()
    if (ext !== 'pdf' && doc.mime_type !== 'application/pdf') {
      return apiError('Only PDF files can be converted to an editable Word copy')
    }

    // Pull the PDF bytes from storage and convert.
    const { data: blob, error: dlErr } = await admin.storage.from(DOCUMENTS_BUCKET).download(doc.file_path)
    if (dlErr || !blob) return apiServerError(dlErr)

    let docxBuf: Buffer
    try {
      docxBuf = await pdfToDocxBuffer(new Uint8Array(await blob.arrayBuffer()))
    } catch (e) {
      return apiServerError(e)
    }

    const baseName = doc.name.replace(/\.[^.]+$/, '')
    const newName = `${baseName} (editable)`.slice(0, 255)
    const newPath = `${workspaceId}/${crypto.randomUUID()}.docx`

    const { error: upErr } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(newPath, docxBuf, { contentType: DOCX_MIME, upsert: false })
    if (upErr) return apiServerError(upErr)

    const { data: row, error: insErr } = await (admin as any)
      .from('documents')
      .insert({
        workspace_id: workspaceId,
        name: newName,
        description: `Editable text copy of "${doc.name}" (formatting not preserved)`.slice(0, 2000),
        file_path: newPath,
        mime_type: DOCX_MIME,
        size_bytes: docxBuf.length,
        uploaded_by: user.id,
      })
      .select('id, name, description, file_path, mime_type, size_bytes, uploaded_by, created_at')
      .single() as { data: any; error: unknown }

    if (insErr || !row) {
      await admin.storage.from(DOCUMENTS_BUCKET).remove([newPath])
      return apiServerError(insErr)
    }

    return apiSuccess({ ...row, uploaded_by_name: null }, 201)
  } catch (err) {
    return apiServerError(err)
  }
}
