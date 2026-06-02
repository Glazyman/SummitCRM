'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, FileSpreadsheet, FileImage, File as FileIcon,
  Upload, Download, Eye, Trash2, Loader2, Pencil, Copy, CopyPlus, MoreHorizontal, ExternalLink, PenLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']

function extOf(d: DocRow): string {
  const m = d.file_path.match(/\.([^.]+)$/)
  return (m ? m[1] : '').toLowerCase()
}
const isPdf = (d: DocRow) => extOf(d) === 'pdf' || d.mime_type === 'application/pdf'
const isImage = (d: DocRow) => (d.mime_type ?? '').startsWith('image/') || IMAGE_EXTS.includes(extOf(d))
const canPreview = (d: DocRow) => isPdf(d) || isImage(d)

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

const EDITABLE_EXTS = ['doc', 'docx']

export function DocumentsClient() {
  const router = useRouter()
  const [docs, setDocs] = React.useState<DocRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [toDelete, setToDelete] = React.useState<DocRow | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  // Viewer
  const [viewing, setViewing] = React.useState<DocRow | null>(null)

  // Edit
  const [editing, setEditing] = React.useState<DocRow | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editDesc, setEditDesc] = React.useState('')
  const [replaceFile, setReplaceFile] = React.useState<File | null>(null)
  const [editSaving, setEditSaving] = React.useState(false)
  const [editError, setEditError] = React.useState<string | null>(null)
  const replaceInput = React.useRef<HTMLInputElement>(null)

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

  // Same-origin proxy URL so the CSP-restricted viewer can embed it.
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

  function openViewer(d: DocRow) {
    setViewing(d); setError(null)
  }

  // Clicking a file VIEWS it. Word docs render in the editor page (in viewing
  // mode, with an Edit toggle); PDF/image/.pages use the read-only popup.
  function openDoc(d: DocRow) {
    if (EDITABLE_EXTS.includes(extOf(d))) { router.push(`/documents/${d.id}/edit`); return }
    openViewer(d)
  }

  // The explicit Edit button opens the editor straight in editing mode.
  function editDoc(d: DocRow) {
    router.push(`/documents/${d.id}/edit?mode=edit`)
  }

  function download(d: DocRow) {
    const a = document.createElement('a')
    a.href = rawUrl(d.id, true)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  function openEdit(d: DocRow) {
    setEditing(d); setEditName(d.name); setEditDesc(d.description ?? '')
    setReplaceFile(null); setEditError(null)
    if (replaceInput.current) replaceInput.current.value = ''
  }

  async function saveEdit() {
    if (!editing) return
    const name = editName.trim()
    if (!name) { setEditError('Name cannot be empty'); return }
    setEditSaving(true); setEditError(null)
    try {
      if (replaceFile) {
        const form = new FormData()
        form.append('file', replaceFile)
        const r = await fetch(`/api/documents/${editing.id}/replace`, { method: 'POST', body: form })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Replace failed')
      }
      const descChanged = (editDesc.trim() || '') !== (editing.description ?? '')
      if (name !== editing.name || descChanged) {
        const r = await fetch(`/api/documents/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: editDesc.trim() || null }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Update failed')
      }
      await load()
      setEditing(null)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  async function duplicate(d: DocRow) {
    setBusyId(d.id); setError(null)
    try {
      const r = await fetch(`/api/documents/${d.id}/duplicate`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Duplicate failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Duplicate failed')
    } finally {
      setBusyId(null)
    }
  }

  // Copy a Word doc, then jump straight into the editor on the new copy —
  // one-click "new agreement from this template".
  async function duplicateAndEdit(d: DocRow) {
    setBusyId(d.id); setError(null)
    try {
      const r = await fetch(`/api/documents/${d.id}/duplicate`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Duplicate failed')
      const newId = j.data?.id as string | undefined
      if (newId) router.push(`/documents/${newId}/edit`)
      else { await load(); setBusyId(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Duplicate failed')
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
                      <button type="button" onClick={() => openDoc(d)}
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
                          disabled={busyId === d.id} onClick={() => openDoc(d)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {EDITABLE_EXTS.includes(extOf(d)) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit"
                            disabled={busyId === d.id} onClick={() => editDoc(d)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download"
                          disabled={busyId === d.id} onClick={() => download(d)}>
                          {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" title="More"
                              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" minWidth="180px">
                            <DropdownMenuItem onClick={() => openEdit(d)} icon={<Pencil className="h-3.5 w-3.5" />}>
                              Edit details
                            </DropdownMenuItem>
                            {EDITABLE_EXTS.includes(extOf(d)) && (
                              <DropdownMenuItem onClick={() => editDoc(d)}
                                icon={<PenLine className="h-3.5 w-3.5" />}>
                                Edit contents
                              </DropdownMenuItem>
                            )}
                            {EDITABLE_EXTS.includes(extOf(d)) && (
                              <DropdownMenuItem onClick={() => duplicateAndEdit(d)} icon={<CopyPlus className="h-3.5 w-3.5" />}>
                                Duplicate &amp; edit
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => duplicate(d)} icon={<Copy className="h-3.5 w-3.5" />}>
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setToDelete(d)}
                              className="text-destructive focus:text-destructive" icon={<Trash2 className="h-3.5 w-3.5" />}>
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
            <div className="flex min-h-[60vh] items-center justify-center rounded-lg border border-border bg-muted/30">
              {viewing && isPdf(viewing) ? (
                <iframe src={rawUrl(viewing.id)} title={viewing.name} className="h-[72vh] w-full rounded-lg" />
              ) : viewing && isImage(viewing) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rawUrl(viewing.id)} alt={viewing.name} className="max-h-[72vh] max-w-full rounded-lg object-contain" />
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
            {viewing && (
              <Button variant="outline" onClick={() => download(viewing)}>
                <Download className="h-4 w-4" /> Download
              </Button>
            )}
            <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit details */}
      <Dialog open={!!editing} onClose={() => (editSaving ? null : setEditing(null))}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit document</DialogTitle>
            <DialogDescription>Rename, add a description, or replace the file with a new version.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-name">Name</Label>
              <Input id="doc-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Document name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-desc">Description</Label>
              <Textarea id="doc-desc" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                rows={3} placeholder="Optional notes about this document" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Replace file</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" type="button" onClick={() => replaceInput.current?.click()}>
                  <Upload className="h-4 w-4" /> Choose file
                </Button>
                <span className="truncate text-[13px] text-muted-foreground">
                  {replaceFile ? replaceFile.name : 'Optional — swaps the stored file, keeps this entry.'}
                </span>
              </div>
              <input ref={replaceInput} type="file" className="hidden"
                onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)} />
            </div>
            {editError && <p className="text-[13px] text-destructive">{editError}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={editSaving}>Cancel</Button>
            <Button onClick={saveEdit} loading={editSaving}>Save</Button>
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
