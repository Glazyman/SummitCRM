'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  FileText, FileSpreadsheet, FileImage, File as FileIcon,
  Upload, Download, Eye, Trash2, ExternalLink, Pencil, FileType2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

const DocxViewer = dynamic(() => import('./docx-viewer'), { ssr: false })

interface DocRow {
  id: string
  name: string
  description: string | null
  file_path: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_by_name: string | null
  created_at: string
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']
const DOCX_EXTS = ['doc', 'docx']
// Files that can open in Word for the web. Office files open directly; PDFs
// are converted to a Word doc first (text only, in-house).
const WORD_OPENABLE = ['doc', 'docx', 'pdf']

function extOf(d: DocRow): string {
  const m = d.file_path.match(/\.([^.]+)$/)
  return (m ? m[1] : '').toLowerCase()
}
const isPdf = (d: DocRow) => extOf(d) === 'pdf' || d.mime_type === 'application/pdf'
const isImage = (d: DocRow) => (d.mime_type ?? '').startsWith('image/') || IMAGE_EXTS.includes(extOf(d))
const isDocx = (d: DocRow) => DOCX_EXTS.includes(extOf(d))

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function DocTypeIcon({ d, className }: { d: DocRow; className?: string }) {
  const ext = extOf(d)
  const mime = d.mime_type ?? ''
  const cls = cn('h-5 w-5', className)
  if (ext === 'pdf' || mime === 'application/pdf') return <FileText className={cn(cls, 'text-red-500')} />
  if (['doc', 'docx', 'pages'].includes(ext)) return <FileText className={cn(cls, 'text-blue-500')} />
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return <FileSpreadsheet className={cn(cls, 'text-green-600')} />
  if (mime.startsWith('image/')) return <FileImage className={cn(cls, 'text-purple-500')} />
  return <FileIcon className={cn(cls, 'text-muted-foreground')} />
}

export function DocumentsClient() {
  const [docs, setDocs] = React.useState<DocRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [toDelete, setToDelete] = React.useState<DocRow | null>(null)
  const [viewing, setViewing] = React.useState<DocRow | null>(null)
  const [renaming, setRenaming] = React.useState<DocRow | null>(null)
  const [renameValue, setRenameValue] = React.useState('')
  const [renameSaving, setRenameSaving] = React.useState(false)
  const [renameError, setRenameError] = React.useState<string | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/documents')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load documents')
      setDocs(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  // Same-origin proxy so the CSP-restricted viewer can embed it.
  function rawUrl(id: string, download = false): string {
    return `/api/documents/${id}/raw${download ? '?download=1' : ''}`
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true); setError(null)
    try {
      for (const file of list) {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/documents', { method: 'POST', body: form })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? `Failed to upload ${file.name}`)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function download(d: DocRow) {
    const a = document.createElement('a')
    a.href = rawUrl(d.id, true)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Open the doc in Word for the web (Microsoft's Office viewer) in a NEW TAB.
  // Office files open directly via their signed URL; PDFs are converted to a
  // Word doc first (returns a signed URL of the temp .docx). The tab is opened
  // synchronously to dodge the popup blocker, then pointed at the viewer.
  async function openInWord(d: DocRow) {
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.document.write('<p style="font:15px system-ui;padding:28px;color:#555">Preparing this document for Word…</p>')
    setError(null)
    try {
      let fileUrl: string
      if (extOf(d) === 'pdf') {
        const res = await fetch(`/api/documents/${d.id}/convert`, { method: 'POST' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not convert this PDF to Word')
        fileUrl = json.data.url
      } else {
        const res = await fetch(`/api/documents/${d.id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not open in Word')
        fileUrl = json.data.url
      }
      const officeUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`
      if (tab) tab.location.href = officeUrl
      else window.open(officeUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      if (tab) tab.close()
      setError(e instanceof Error ? e.message : 'Could not open in Word')
    }
  }

  function openRename(d: DocRow) {
    setRenaming(d); setRenameValue(d.name); setRenameError(null)
  }

  async function saveRename() {
    if (!renaming) return
    const name = renameValue.trim()
    if (!name) { setRenameError('Name cannot be empty'); return }
    setRenameSaving(true); setRenameError(null)
    try {
      const res = await fetch(`/api/documents/${renaming.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Rename failed')
      setDocs((prev) => prev.map((x) => (x.id === renaming.id ? { ...x, name } : x)))
      setRenaming(null)
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : 'Rename failed')
    } finally {
      setRenameSaving(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    const d = toDelete
    setBusyId(d.id)
    try {
      const res = await fetch(`/api/documents/${d.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Delete failed')
      setDocs((prev) => prev.filter((x) => x.id !== d.id))
      setToDelete(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em]">Documents</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Contracts, templates, and signed agreements — admin only.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <Button variant="outline" asChild>
            <Link href="/documents/convert">
              <FileType2 className="h-4 w-4" />
              PDF → Word
            </Link>
          </Button>
          <Button onClick={() => fileInput.current?.click()} loading={uploading}>
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        </div>
        <input ref={fileInput} type="file" multiple className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {/* Drop zone + table */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files) }}
        className={cn(
          'rounded-xl border bg-card shadow-xs transition-colors',
          dragOver ? 'border-primary border-dashed bg-accent/40' : 'border-border',
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner /></div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Upload className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No documents yet</p>
            <p className="text-[13px] text-muted-foreground">Drag files here or click Upload. PDF, Word, Pages, and more.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12px] font-medium text-muted-foreground">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Size</th>
                  <th className="px-4 py-2.5">Uploaded by</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 last:border-0 hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setViewing(d)}
                        className="flex items-center gap-2.5 text-left hover:underline">
                        <DocTypeIcon d={d} />
                        <span className="font-medium">{d.name}</span>
                      </button>
                      {d.description && (
                        <p className="ml-[30px] mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{d.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 uppercase text-muted-foreground">{extOf(d) || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatBytes(d.size_bytes)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.uploaded_by_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{dateFmt.format(new Date(d.created_at))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View"
                          onClick={() => setViewing(d)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download"
                          onClick={() => download(d)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Rename"
                          onClick={() => openRename(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete" disabled={busyId === d.id} onClick={() => setToDelete(d)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Viewer */}
      <Dialog open={!!viewing} onClose={() => setViewing(null)}>
        <DialogContent size="full" className="w-[95vw]">
          <DialogHeader className="pr-10">
            <DialogTitle className="truncate">{viewing?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex min-h-[60vh] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
              {viewing && isPdf(viewing) ? (
                <iframe src={rawUrl(viewing.id)} title={viewing.name} className="h-[72vh] w-full rounded-lg" />
              ) : viewing && isImage(viewing) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rawUrl(viewing.id)} alt={viewing.name} className="max-h-[72vh] max-w-full rounded-lg object-contain" />
              ) : viewing && isDocx(viewing) ? (
                <DocxViewer docId={viewing.id} />
              ) : viewing ? (
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                  <DocTypeIcon d={viewing} className="h-10 w-10" />
                  <p className="text-sm font-medium">No in-browser preview for .{extOf(viewing)} files</p>
                  <p className="max-w-sm text-[13px] text-muted-foreground">
                    {extOf(viewing) === 'pages'
                      ? 'Apple Pages files can’t be previewed on the web. Download to open in Pages or Word.'
                      : 'This file type can’t render in the browser. Download it to view.'}
                  </p>
                  <Button variant="outline" onClick={() => download(viewing)}>
                    <Download className="h-4 w-4" /> Download
                  </Button>
                </div>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            {viewing && (
              <a href={rawUrl(viewing.id)} target="_blank" rel="noopener noreferrer"
                className="mr-auto inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
              </a>
            )}
            {viewing && WORD_OPENABLE.includes(extOf(viewing)) && (
              <Button variant="outline" onClick={() => openInWord(viewing)}>
                <FileText className="h-4 w-4" /> Open in Word
              </Button>
            )}
            {viewing && (
              <Button variant="outline" onClick={() => download(viewing)}>
                <Download className="h-4 w-4" /> Download
              </Button>
            )}
            <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={!!renaming} onClose={() => (renameSaving ? null : setRenaming(null))}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') saveRename() }}
              placeholder="Document name"
            />
            {renameError && <p className="mt-2 text-[13px] text-destructive">{renameError}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)} disabled={renameSaving}>Cancel</Button>
            <Button onClick={saveRename} loading={renameSaving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!toDelete} onClose={() => (busyId ? null : setToDelete(null))}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{toDelete?.name}&rdquo;? This permanently removes the file and can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={!!busyId}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} loading={!!busyId && busyId === toDelete?.id}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
