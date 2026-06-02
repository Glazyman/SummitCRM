'use client'

import * as React from 'react'
import {
  FileText, FileSpreadsheet, FileImage, File as FileIcon,
  Upload, Download, Eye, Trash2, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

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

function extOf(d: DocRow): string {
  const m = d.file_path.match(/\.([^.]+)$/)
  return (m ? m[1] : '').toLowerCase()
}

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function DocTypeIcon({ d }: { d: DocRow }) {
  const ext = extOf(d)
  const mime = d.mime_type ?? ''
  const cls = 'h-5 w-5'
  if (ext === 'pdf' || mime === 'application/pdf') return <FileText className={cn(cls, 'text-red-500')} />
  if (['doc', 'docx', 'pages'].includes(ext)) return <FileText className={cn(cls, 'text-blue-500')} />
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return <FileSpreadsheet className={cn(cls, 'text-green-600')} />
  if (mime.startsWith('image/')) return <FileImage className={cn(cls, 'text-purple-500')} />
  return <FileIcon className={cn(cls, 'text-muted-foreground')} />
}

const PREVIEWABLE = (d: DocRow) => extOf(d) === 'pdf' || d.mime_type === 'application/pdf' || (d.mime_type ?? '').startsWith('image/')

export function DocumentsClient() {
  const [docs, setDocs] = React.useState<DocRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [toDelete, setToDelete] = React.useState<DocRow | null>(null)
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

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    setError(null)
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

  async function openDoc(d: DocRow, download: boolean) {
    setBusyId(d.id)
    try {
      const res = await fetch(`/api/documents/${d.id}${download ? '?download=1' : ''}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not open document')
      window.open(json.data.url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open document')
    } finally {
      setBusyId(null)
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
        <Button onClick={() => fileInput.current?.click()} loading={uploading} className="sm:shrink-0">
          <Upload className="h-4 w-4" />
          Upload
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
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
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files)
        }}
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
            <p className="text-[13px] text-muted-foreground">
              Drag files here or click Upload. PDF, Word, Pages, and more.
            </p>
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
                      <div className="flex items-center gap-2.5">
                        <DocTypeIcon d={d} />
                        <span className="font-medium">{d.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 uppercase text-muted-foreground">{extOf(d) || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatBytes(d.size_bytes)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.uploaded_by_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{dateFmt.format(new Date(d.created_at))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {PREVIEWABLE(d) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Preview"
                            disabled={busyId === d.id} onClick={() => openDoc(d, false)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download"
                          disabled={busyId === d.id} onClick={() => openDoc(d, true)}>
                          {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
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
            <Button variant="destructive" onClick={confirmDelete} loading={!!busyId && busyId === toDelete?.id}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
