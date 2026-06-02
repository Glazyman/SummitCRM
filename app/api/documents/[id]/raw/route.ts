/**
 * GET /api/documents/[id]/raw
 *
 * Streams the file bytes from the private bucket through our own origin so the
 * in-app viewer can embed it (the app's CSP restricts frames to same-origin —
 * a cross-origin Supabase iframe is blocked). Inline by default; ?download=1
 * forces an attachment download with the document's name.
 *
 * Admin only. The framing headers for this exact route are relaxed in
 * middleware.ts (X-Frame-Options SAMEORIGIN + frame-ancestors 'self') so the
 * same-origin viewer can embed it.
 */
import { NextRequest } from 'next/server'
import { requireDocumentAdmin, loadDocument, DOCUMENTS_BUCKET } from '@/lib/documents/context'
import { apiNotFound, apiServerError } from '@/lib/utils/api'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireDocumentAdmin()
    if ('error' in ctx) return ctx.error
    const { admin, workspaceId } = ctx
    const { id } = await params

    const doc = await loadDocument(admin, workspaceId, id)
    if (!doc) return apiNotFound('Document')

    const { data, error } = await admin.storage.from(DOCUMENTS_BUCKET).download(doc.file_path)
    if (error || !data) return apiServerError(error)

    const buf = await data.arrayBuffer()
    const ext = doc.file_path.includes('.') ? '.' + doc.file_path.split('.').pop() : ''
    const downloadName = /\.[^.]+$/.test(doc.name) ? doc.name : doc.name + ext
    const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'

    return new Response(buf, {
      headers: {
        'Content-Type': doc.mime_type || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(downloadName)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    return apiServerError(err)
  }
}
