'use client'

import * as React from 'react'
import Link from 'next/link'
import { Upload, FileText, Download, Loader2, CheckCircle2, AlertCircle, ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  name: string
  status: 'converting' | 'done' | 'error'
  url?: string
  error?: string
}

let counter = 0

export function ConvertClient() {
  const [items, setItems] = React.useState<Item[]>([])
  const [dragOver, setDragOver] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)

  // Revoke object URLs on unmount.
  React.useEffect(() => () => { items.forEach((i) => i.url && URL.revokeObjectURL(i.url)) }, [items])

  async function convertOne(file: File) {
    const id = `f${++counter}`
    const outName = (file.name.replace(/\.[^.]+$/, '') || 'document') + '.docx'
    setItems((prev) => [{ id, name: outName, status: 'converting' }, ...prev])
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/tools/pdf-to-word', { method: 'POST', body: form })
      if (!res.ok) {
        let msg = 'Conversion failed'
        try { msg = (await res.json()).error ?? msg } catch { /* non-JSON */ }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'done', url } : i)))
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'error', error: e instanceof Error ? e.message : 'Failed' } : i)))
    }
  }

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    const skipped = Array.from(files).length - list.length
    if (skipped > 0 && list.length === 0) {
      setItems((prev) => [{ id: `f${++counter}`, name: 'Only PDF files are supported', status: 'error', error: 'Drop PDF files only' }, ...prev])
    }
    list.forEach((f) => convertOne(f))
  }

  function downloadItem(i: Item) {
    if (!i.url) return
    const a = document.createElement('a')
    a.href = i.url
    a.download = i.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <Link href="/documents" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Documents
        </Link>
        <h1 className="text-xl font-bold tracking-[-0.02em]">PDF → Word</h1>
        <p className="text-[13px] text-muted-foreground">
          Drop PDFs to convert them to editable Word (.docx) files, then download. Conversion is
          <strong> text only</strong> — formatting, logos, and signatures aren’t preserved. For best results,
          open the downloaded file (or the original PDF) in desktop Word.
        </p>
      </div>

      {/* Drop zone */}
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files) }}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 text-center transition-colors',
          dragOver ? 'border-primary bg-accent/40' : 'border-border bg-card hover:bg-accent/20',
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold">Drag &amp; drop PDFs here</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">or click to choose files — up to 25 MB each</p>
        </div>
      </button>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple className="hidden"
        onChange={(e) => e.target.files && addFiles(e.target.files)} />

      {/* Results */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-xs">
              <FileText className={cn('h-5 w-5 shrink-0', i.status === 'error' ? 'text-muted-foreground' : 'text-blue-500')} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.name}</p>
                {i.status === 'converting' && <p className="text-[12px] text-muted-foreground">Converting…</p>}
                {i.status === 'error' && <p className="text-[12px] text-destructive">{i.error}</p>}
                {i.status === 'done' && <p className="text-[12px] text-muted-foreground">Ready to download</p>}
              </div>
              {i.status === 'converting' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {i.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
              {i.status === 'done' && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <Button size="sm" variant="outline" onClick={() => downloadItem(i)}>
                    <Download className="h-4 w-4" /> Download
                  </Button>
                </>
              )}
              <button type="button" onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
