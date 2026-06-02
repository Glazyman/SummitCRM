/**
 * POST /api/documents/[id]/convert
 *
 * Converts a PDF into a TEMPORARY editable .docx (text only, in-house — see
 * lib/documents/pdf-to-docx.ts) and returns a short-lived signed URL for it.
 * Used by the "Open in Word" action on a PDF: the client hands that URL to the
 * Office web viewer. The temp object lives under <ws>/word-export/ and is NOT
 * a documents row (doesn't clutter the library). The original PDF is untouched.
 *
 * Admin only. Runs on Node (pdfjs) with a hard timeout in the helper.
 */
import { NextRequest } from 'next/server'
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
    const { admin, workspaceId } = ctx
    const { id } = await params

    const doc = await loadDocument(admin, workspaceId, id)
    if (!doc) return apiNotFound('Document')

    const ext = (doc.file_path.split('.').pop() ?? '').toLowerCase()
    if (ext !== 'pdf' && doc.mime_type !== 'application/pdf') {
      return apiError('Only PDF files can be converted to Word')
    }

    const { data: blob, error: dlErr } = await admin.storage.from(DOCUMENTS_BUCKET).download(doc.file_path)
    if (dlErr || !blob) return apiServerError(dlErr)

    let docxBuf: Buffer
    try {
      docxBuf = await pdfToDocxBuffer(new Uint8Array(await blob.arrayBuffer()))
    } catch (e) {
      // Surface a clean message (timeout / scanned PDF / parse error) to the client.
      return apiError(e instanceof Error ? e.message : 'PDF conversion failed', 422)
    }

    const tmpPath = `${workspaceId}/word-export/${crypto.randomUUID()}.docx`
    const { error: upErr } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(tmpPath, docxBuf, { contentType: DOCX_MIME, upsert: false })
    if (upErr) return apiServerError(upErr)

    // 1-hour signed URL — Office's viewer fetches it server-side on open.
    const { data: signed, error: signErr } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(tmpPath, 3600)
    if (signErr || !signed) return apiServerError(signErr)

    return apiSuccess({ url: signed.signedUrl })
  } catch (err) {
    return apiServerError(err)
  }
}
