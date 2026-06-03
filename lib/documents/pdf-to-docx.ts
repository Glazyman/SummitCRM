/**
 * In-house PDF → .docx text conversion (server-side, no external service).
 *
 * Uses `unpdf` — a serverless-friendly PDF text extractor that bundles a
 * polyfilled pdfjs, so it runs in Vercel's Node runtime without the browser
 * globals raw pdfjs-dist needs (DOMMatrix/Path2D/etc.). TEXT ONLY — layout,
 * images, and signatures are lost; scanned/image-only PDFs (no text layer)
 * throw a clear error.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

export async function pdfToDocxBuffer(data: Uint8Array): Promise<Buffer> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const { Document, Packer, Paragraph, TextRun } = await import('docx')

  const pdf = await withTimeout(getDocumentProxy(data), 45_000, 'PDF parsing timed out')
  const { text } = await withTimeout(
    extractText(pdf, { mergePages: true }),
    45_000,
    'PDF text extraction timed out',
  ) as { text: string | string[] }

  const raw = Array.isArray(text) ? text.join('\n') : text
  const lines = raw.split(/\r?\n/)

  if (!lines.some((l) => l.trim())) {
    throw new Error('No selectable text found — this looks like a scanned/image-only PDF, which can’t be converted.')
  }

  const doc = new Document({
    sections: [{ children: lines.map((l) => new Paragraph({ children: [new TextRun(l)] })) }],
  })
  return Packer.toBuffer(doc)
}
