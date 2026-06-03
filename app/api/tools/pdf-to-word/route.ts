/**
 * POST /api/tools/pdf-to-word
 *
 * Standalone PDF → Word converter for the /documents/convert tool. Accepts a
 * single uploaded PDF (multipart/form-data `file`), converts it to a .docx
 * (in-house text extraction — see lib/documents/pdf-to-docx.ts) and streams
 * the .docx straight back as a download. Nothing is stored.
 *
 * Admin only. Text only (no layout/formatting).
 */
import { NextRequest } from 'next/server'
import { requireDocumentAdmin } from '@/lib/documents/context'
import { pdfToDocxBuffer } from '@/lib/documents/pdf-to-docx'
import { apiError } from '@/lib/utils/api'

export const runtime = 'nodejs'
export const maxDuration = 60

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const MAX_BYTES = 25 * 1024 * 1024

export async function POST(request: NextRequest) {
  const ctx = await requireDocumentAdmin()
  if ('error' in ctx) return ctx.error

  let form: FormData
  try { form = await request.formData() } catch { return apiError('Expected multipart/form-data') }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return apiError('No file provided')
  if (file.size > MAX_BYTES) return apiError('File exceeds the 25 MB limit')

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (ext !== 'pdf' && file.type !== 'application/pdf') {
    return apiError('Only PDF files can be converted to Word')
  }

  let docxBuf: Buffer
  try {
    docxBuf = await pdfToDocxBuffer(new Uint8Array(await file.arrayBuffer()))
  } catch (e) {
    return apiError(e instanceof Error ? e.message : 'Conversion failed', 422)
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'document'
  return new Response(new Uint8Array(docxBuf), {
    headers: {
      'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(baseName)}.docx"`,
      'Cache-Control': 'no-store',
    },
  })
}
