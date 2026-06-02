/**
 * In-house PDF → .docx text conversion (server-side, no external service).
 *
 * Extracts the PDF text layer with pdfjs-dist and emits a .docx whose
 * paragraphs mirror the lines. TEXT ONLY — layout/images/signatures are lost,
 * and scanned/image-only PDFs (no text layer) throw a clear error.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

// pdfjs-dist v5 uses Promise.withResolvers, which only exists on Node 22+.
// Polyfill it so the route also works if the runtime lands on Node 20 (this
// was the silent prod failure: Vercel defaulted to Node 20).
if (typeof (Promise as any).withResolvers !== 'function') {
  ;(Promise as any).withResolvers = function () {
    let resolve: any, reject: any
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

export async function pdfToDocxBuffer(data: Uint8Array): Promise<Buffer> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { Document, Packer, Paragraph, TextRun } = await import('docx')

  const pdf = await withTimeout(
    pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false } as any).promise,
    45_000,
    'PDF parsing timed out',
  )

  const lines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue
      line += item.str
      if (item.hasEOL) { lines.push(line); line = '' }
    }
    if (line.trim()) lines.push(line)
    if (p < pdf.numPages) lines.push('') // blank line between pages
  }

  if (!lines.some((l) => l.trim())) {
    throw new Error('No selectable text found — this looks like a scanned/image-only PDF, which can’t be converted.')
  }

  const doc = new Document({
    sections: [{ children: lines.map((l) => new Paragraph({ children: [new TextRun(l)] })) }],
  })
  return Packer.toBuffer(doc)
}
