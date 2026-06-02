/**
 * In-house PDF → .docx text conversion (server-side, no external service).
 *
 * Extracts the text layer from a PDF with pdfjs-dist and emits a .docx whose
 * paragraphs mirror the PDF's lines. TEXT ONLY — layout, images, logos, and
 * signatures are not preserved (there's no OCR, so scanned/image-only PDFs
 * yield little or nothing). Good enough to make typed agreements editable.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function pdfToDocxBuffer(data: Uint8Array): Promise<Buffer> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { Document, Packer, Paragraph, TextRun } = await import('docx')

  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false } as any).promise

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

  const doc = new Document({
    sections: [{ children: lines.map((l) => new Paragraph({ children: [new TextRun(l)] })) }],
  })
  return Packer.toBuffer(doc)
}
