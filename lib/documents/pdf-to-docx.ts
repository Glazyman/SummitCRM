/**
 * In-house PDF → .docx text conversion (server-side, no external service).
 *
 * Uses `unpdf` (serverless-friendly, bundles a polyfilled pdfjs) to read the
 * PDF, then walks each page's text items and breaks lines on pdfjs's `hasEOL`
 * flag so the .docx keeps the PDF's line/paragraph structure (instead of one
 * giant block). TEXT ONLY — bold, centering, numbered lists, indentation, and
 * images are NOT preserved; scanned/image-only PDFs throw a clear error.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])
}

export async function pdfToDocxBuffer(data: Uint8Array): Promise<Buffer> {
  const { getDocumentProxy } = await import('unpdf')
  const { Document, Packer, Paragraph, TextRun } = await import('docx')

  const pdf: any = await withTimeout(getDocumentProxy(data), 45_000, 'PDF parsing timed out')

  const lines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue
      line += item.str
      if (item.hasEOL) { lines.push(line); line = '' } // pdfjs marks visual line ends
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
