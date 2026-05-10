'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Trash2, Upload, RefreshCw, Database, Pencil, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

interface BatchRow {
  id: string
  name: string
  leadCount: number
  createdAt: string
}

interface BatchLead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  company: string | null
  title: string | null
  status: string
  created_at: string
}

interface BatchDetailResponse {
  data?: {
    batch: { id: string; name: string; created_at: string }
    leads: BatchLead[]
  }
  error?: string
}

interface BatchSheetResponse {
  data?: {
    headers: string[]
    rows: Record<string, string>[]
    hasOriginalSheet: boolean
    truncated?: boolean
    totalRows?: number
    importFileName?: string
  }
  error?: string
}

const LEAD_COLUMNS: Array<{ key: string; label: string; value: (lead: BatchLead) => string }> = [
  { key: 'name', label: 'Name', value: (l) => [l.first_name, l.last_name].filter(Boolean).join(' ') || '—' },
  { key: 'email', label: 'Email', value: (l) => l.email || '—' },
  { key: 'phone', label: 'Phone', value: (l) => l.phone || '—' },
  { key: 'company', label: 'Company', value: (l) => l.company || '—' },
  { key: 'title', label: 'Title', value: (l) => l.title || '—' },
  { key: 'status', label: 'Status', value: (l) => l.status || '—' },
  { key: 'created_at', label: 'Created', value: (l) => new Date(l.created_at).toLocaleDateString() },
]

export function BatchesClient() {
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [openBatchId, setOpenBatchId] = useState<string | null>(null)
  const [openBatchName, setOpenBatchName] = useState<string>('')
  const [openStep, setOpenStep] = useState<'leads' | 'sheet'>('leads')
  const [batchLeads, setBatchLeads] = useState<BatchLead[]>([])
  const [batchLoading, setBatchLoading] = useState(false)

  const [sheetHeaders, setSheetHeaders] = useState<string[]>([])
  const [sheetRows, setSheetRows] = useState<Record<string, string>[]>([])
  const [sheetLoading, setSheetLoading] = useState(false)
  const [hasOriginalSheet, setHasOriginalSheet] = useState(false)
  const [sheetTruncated, setSheetTruncated] = useState(false)
  const [sheetTotalRows, setSheetTotalRows] = useState(0)
  const [importFileName, setImportFileName] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/batches')
      const json = await res.json() as { data?: { batches: BatchRow[] }; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to load batches')
      setBatches(json.data?.batches ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load batches')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(id)
  }, [load])

  async function openBatch(batch: BatchRow) {
    setOpenBatchId(batch.id)
    setOpenBatchName(batch.name)
    setOpenStep('leads')
    setError(null)

    setBatchLoading(true)
    try {
      const res = await fetch(`/api/batches/${batch.id}/leads`)
      const json = await res.json() as BatchDetailResponse
      if (!res.ok) throw new Error(json.error ?? 'Failed to load batch leads')
      setBatchLeads(json.data?.leads ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load batch leads')
      setBatchLeads([])
    } finally {
      setBatchLoading(false)
    }

    setSheetLoading(true)
    try {
      const res = await fetch(`/api/batches/${batch.id}/sheet`)
      const json = await res.json() as BatchSheetResponse
      if (!res.ok) throw new Error(json.error ?? 'Failed to load original sheet')

      setSheetHeaders(json.data?.headers ?? [])
      setSheetRows(json.data?.rows ?? [])
      setHasOriginalSheet(Boolean(json.data?.hasOriginalSheet))
      setSheetTruncated(Boolean(json.data?.truncated))
      setSheetTotalRows(json.data?.totalRows ?? 0)
      setImportFileName(json.data?.importFileName ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load original sheet')
      setSheetHeaders([])
      setSheetRows([])
      setHasOriginalSheet(false)
      setSheetTruncated(false)
      setSheetTotalRows(0)
      setImportFileName(null)
    } finally {
      setSheetLoading(false)
    }
  }

  async function renameBatch(batch: BatchRow) {
    const nextName = prompt('Rename batch', batch.name)?.trim()
    if (!nextName || nextName === batch.name) return

    setRenamingId(batch.id)
    setError(null)
    try {
      const res = await fetch(`/api/batches/${batch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Rename failed')

      setBatches((prev) => prev.map((b) => (b.id === batch.id ? { ...b, name: nextName } : b)))
      if (openBatchId === batch.id) setOpenBatchName(nextName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setRenamingId(null)
    }
  }

  async function renameSelected() {
    if (selectedIds.size !== 1) return
    const batch = batches.find((b) => selectedIds.has(b.id))
    if (!batch) return
    await renameBatch(batch)
  }

  async function deleteSelected() {
    const selected = batches.filter((b) => selectedIds.has(b.id))
    if (selected.length === 0) return
    if (!confirm(`Delete ${selected.length} selected batch(es) and all their leads? This cannot be undone.`)) return

    setBulkDeleting(true)
    setError(null)
    try {
      for (const batch of selected) {
        const res = await fetch(`/api/batches/${batch.id}`, { method: 'DELETE' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((json as { error?: string }).error ?? `Failed deleting ${batch.name}`)
      }

      const selectedSet = new Set(selected.map((b) => b.id))
      setBatches((prev) => prev.filter((b) => !selectedSet.has(b.id)))
      setSelectedIds(new Set())
      if (openBatchId && selectedSet.has(openBatchId)) {
        setOpenBatchId(null)
        setBatchLeads([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  const allSelected = batches.length > 0 && batches.every((b) => selectedIds.has(b.id))
  const someSelected = batches.some((b) => selectedIds.has(b.id)) && !allSelected

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Batches</h1>
            <p className="text-sm text-muted-foreground">Click a batch to open Step 2/3 style side panel.</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void renameSelected()}
                  disabled={selectedIds.size !== 1 || !!renamingId || bulkDeleting}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {renamingId ? 'Renaming…' : `Rename (${selectedIds.size})`}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void deleteSelected()}
                  disabled={bulkDeleting || !!renamingId}
                  className="gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {bulkDeleting ? 'Deleting…' : `Delete (${selectedIds.size})`}
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button size="sm" asChild className="gap-1.5">
              <Link href="/leads/import">
                <Upload className="h-3.5 w-3.5" />
                Import Leads
              </Link>
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-border overflow-hidden bg-card">
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading batches…</div>
          ) : batches.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <Database className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No batches yet</p>
              <p className="text-sm text-muted-foreground mt-1">Import leads to create your first batch.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="w-10 px-5 py-4 text-left">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={() => setSelectedIds(allSelected ? new Set() : new Set(batches.map((b) => b.id)))}
                      aria-label="Select all batches"
                    />
                  </th>
                  <th className="px-5 py-4 text-left font-medium text-muted-foreground">Batch</th>
                  <th className="px-5 py-4 text-left font-medium text-muted-foreground">Leads</th>
                  <th className="px-5 py-4 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-5 py-4 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-4">
                      <Checkbox
                        checked={selectedIds.has(b.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(b.id)) next.delete(b.id)
                            else next.add(b.id)
                            return next
                          })
                        }}
                        aria-label={`Select batch ${b.name}`}
                      />
                    </td>
                    <td className="px-5 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => void openBatch(b)}
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        {b.name}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </td>
                    <td className="px-5 py-4">{b.leadCount.toLocaleString()}</td>
                    <td className="px-5 py-4 text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void openBatch(b)}
                        className="gap-1.5"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openBatchId && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpenBatchId(null)}
            aria-label="Close batch panel"
          />

          <div className="absolute right-0 top-0 h-full w-full max-w-6xl border-l border-border bg-background shadow-2xl">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Batch View</p>
                  <h2 className="text-lg font-semibold">{openBatchName}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenBatchId(null)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <button
                  type="button"
                  onClick={() => setOpenStep('leads')}
                  className={`rounded-lg px-3 py-1.5 text-sm ${openStep === 'leads' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  Step 2: Leads
                </button>
                <button
                  type="button"
                  onClick={() => setOpenStep('sheet')}
                  className={`rounded-lg px-3 py-1.5 text-sm ${openStep === 'sheet' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  Step 3: Original Sheet
                </button>
              </div>

              <div className="flex-1 overflow-auto p-5">
                {openStep === 'leads' && (
                  <>
                    {batchLoading ? (
                      <p className="text-sm text-muted-foreground">Loading batch leads…</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full min-w-[900px] text-sm">
                          <thead className="bg-muted/40">
                            <tr>
                              {LEAD_COLUMNS.map((col) => (
                                <th key={col.key} className="px-3 py-2.5 text-left font-medium text-muted-foreground">{col.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {batchLeads.map((lead) => (
                              <tr key={lead.id} className="border-t border-border/60">
                                {LEAD_COLUMNS.map((col) => (
                                  <td key={col.key} className="px-3 py-2.5">{col.value(lead)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!batchLoading && batchLeads.length === 0 && (
                      <p className="mt-3 text-sm text-muted-foreground">No leads in this batch yet.</p>
                    )}
                  </>
                )}

                {openStep === 'sheet' && (
                  <>
                    {sheetLoading ? (
                      <p className="text-sm text-muted-foreground">Loading original uploaded sheet…</p>
                    ) : !hasOriginalSheet ? (
                      <p className="text-sm text-muted-foreground">No original upload file found for this batch.</p>
                    ) : (
                      <>
                        <p className="mb-3 text-sm text-muted-foreground">
                          Showing original file{importFileName ? `: ${importFileName}` : ''}
                          {sheetTruncated ? ` (${sheetRows.length} of ${sheetTotalRows} rows shown)` : ''}
                        </p>
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full min-w-[1000px] text-sm">
                            <thead className="bg-muted/40">
                              <tr>
                                {sheetHeaders.map((header) => (
                                  <th key={header} className="px-3 py-2.5 text-left font-medium text-muted-foreground">{header || 'Untitled'}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sheetRows.map((row, i) => (
                                <tr key={`row-${i}`} className="border-t border-border/60">
                                  {sheetHeaders.map((header) => (
                                    <td key={`${i}-${header}`} className="px-3 py-2.5">{row[header] ?? ''}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
