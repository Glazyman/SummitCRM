'use client'

import 'superdoc/style.css'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function DocxEditorClient({ docId, docName, fileExt }: { docId: string; docName: string; fileExt: string }) {
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instanceRef = React.useRef<any>(null)
  const [ready, setReady] = React.useState(false)
  const [saving, setSaving] = React.useState<null | 'version' | 'copy'>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let destroyed = false
    ;(async () => {
      try {
        // Dynamic import keeps SuperDoc out of the SSR/server bundle.
        const mod = await import('superdoc')
        if (destroyed) return
        const SuperDoc = (mod as { SuperDoc: new (opts: unknown) => unknown }).SuperDoc
        instanceRef.current = new SuperDoc({
          selector: '#superdoc-editor',
          toolbar: '#superdoc-toolbar',
          document: `/api/documents/${docId}/raw`,
          documentMode: 'editing',
          onReady: () => { if (!destroyed) setReady(true) },
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load the editor')
      }
    })()
    return () => {
      destroyed = true
      try { instanceRef.current?.destroy?.() } catch { /* noop */ }
      instanceRef.current = null
    }
  }, [docId])

  async function save(mode: 'version' | 'copy') {
    if (!instanceRef.current) return
    setSaving(mode); setError(null)
    try {
      const blob: Blob = await instanceRef.current.export({ triggerDownload: false })
      const filename = /\.[^.]+$/.test(docName) ? docName : `${docName}.${fileExt}`
      const form = new FormData()
      form.append('file', new File([blob], filename, { type: DOCX_MIME }))

      let res: Response
      if (mode === 'version') {
        res = await fetch(`/api/documents/${docId}/replace`, { method: 'POST', body: form })
      } else {
        form.append('name', `Copy of ${docName}`)
        res = await fetch('/api/documents', { method: 'POST', body: form })
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      router.push('/documents')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push('/documents')} title="Back to documents">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-[-0.02em]">{docName}</h1>
            <p className="text-[12px] text-muted-foreground">
              Editing .{fileExt} — nothing is saved until you choose an option.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => save('copy')} loading={saving === 'copy'} disabled={!ready || !!saving}>
            <Copy className="h-4 w-4" /> Save as copy
          </Button>
          <Button onClick={() => save('version')} loading={saving === 'version'} disabled={!ready || !!saving}>
            <Save className="h-4 w-4" /> Save version
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div id="superdoc-toolbar" />
        <div className="relative">
          {!ready && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
              <Spinner />
            </div>
          )}
          <div id="superdoc-editor" className="min-h-[70vh]" />
        </div>
      </div>
    </div>
  )
}
