'use client'

import { useCallback, useEffect, useState } from 'react'
import { Database, RefreshCw, Pencil, Trash2, X, ExternalLink, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { LeadFullPanel } from '@/components/leads/lead-full-panel'
import type { TeamMember } from '@/components/leads/detail/types'

interface BatchRow {
  id:        string
  name:      string
  leadCount: number
  createdAt: string
}

interface BatchLead {
  id:         string
  first_name: string | null
  last_name:  string | null
  email:      string
  phone:      string | null
  company:    string | null
  title:      string | null
  status:     string
  created_at: string
}

interface Props {
  isAdmin:       boolean
  currentUserId: string
  teamMembers:   TeamMember[]
}

export function BatchesView({ isAdmin, currentUserId, teamMembers }: Props) {
  const [batches,      setBatches]      = useState<BatchRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [renamingId,   setRenamingId]   = useState<string | null>(null)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)

  // Selected batch → lead list panel
  const [openBatch,    setOpenBatch]    = useState<BatchRow | null>(null)
  const [batchLeads,   setBatchLeads]   = useState<BatchLead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(false)

  // Selected lead → full panel
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  const loadBatches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/batches')
      const json = await res.json() as { data?: { batches: BatchRow[] }; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to load batches')
      setBatches(json.data?.batches ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load batches')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadBatches() }, [loadBatches])

  async function openBatchLeads(batch: BatchRow) {
    setOpenBatch(batch)
    setBatchLeads([])
    setLeadsLoading(true)
    try {
      const res  = await fetch(`/api/batches/${batch.id}/leads`)
      const json = await res.json() as { data?: { leads: BatchLead[] }; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to load leads')
      setBatchLeads(json.data?.leads ?? [])
    } catch {
      setBatchLeads([])
    } finally {
      setLeadsLoading(false)
    }
  }

  async function renameBatch(batch: BatchRow) {
    const next = prompt('Rename batch', batch.name)?.trim()
    if (!next || next === batch.name) return
    setRenamingId(batch.id)
    try {
      const res = await fetch(`/api/batches/${batch.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: next }),
      })
      if (res.ok) {
        setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, name: next } : b))
        if (openBatch?.id === batch.id) setOpenBatch(b => b ? { ...b, name: next } : b)
      }
    } finally { setRenamingId(null) }
  }

  async function deleteBatch(batch: BatchRow) {
    if (!confirm(`Delete "${batch.name}" and all its leads? This cannot be undone.`)) return
    setDeletingId(batch.id)
    try {
      const res = await fetch(`/api/batches/${batch.id}`, { method: 'DELETE' })
      if (res.ok) {
        setBatches(prev => prev.filter(b => b.id !== batch.id))
        if (openBatch?.id === batch.id) setOpenBatch(null)
      }
    } finally { setDeletingId(null) }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
        </p>
        <Button variant="outline" size="sm" onClick={loadBatches} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Batch table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading batches…
          </div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Database className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No batches yet</p>
            <p className="text-xs text-muted-foreground">Import leads to create your first batch.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Batch</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Leads</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {batches.map(batch => (
                <tr
                  key={batch.id}
                  className={cn(
                    'group transition-colors',
                    openBatch?.id === batch.id && 'bg-primary/5'
                  )}
                >
                  <td className="px-5 py-3 font-medium">{batch.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{batch.leadCount.toLocaleString()}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {new Date(batch.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* View leads */}
                      <button
                        onClick={() => openBatchLeads(batch)}
                        className={cn(
                          'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          openBatch?.id === batch.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground'
                        )}
                        title="View leads"
                      >
                        View leads
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => renameBatch(batch)}
                            disabled={!!renamingId}
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteBatch(batch)}
                            disabled={deletingId === batch.id}
                            className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Batch leads panel */}
      {openBatch && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => { setOpenBatch(null); setSelectedLeadId(null) }} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Batch</p>
                <h2 className="text-lg font-semibold">{openBatch.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => { setOpenBatch(null); setSelectedLeadId(null) }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Leads table */}
            <div className="flex-1 overflow-auto p-5">
              {leadsLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading leads…
                </div>
              ) : batchLeads.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No leads in this batch.</p>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Email</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Company</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Phone</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                        <th className="w-8 px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {batchLeads.map(lead => {
                        const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
                        return (
                          <tr
                            key={lead.id}
                            onClick={() => setSelectedLeadId(lead.id)}
                            className="cursor-pointer hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-4 py-2.5 font-medium">{name}</td>
                            <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[180px]">{lead.email}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{lead.company ?? '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{lead.phone ?? '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground capitalize">{lead.status.replace(/_/g, ' ')}</td>
                            <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                              <a
                                href={`/leads/${lead.id}`}
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title="Open lead"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Lead full panel on top of batch panel */}
          {selectedLeadId && (
            <>
              <div className="fixed inset-0 z-[60] bg-black/20" onClick={() => setSelectedLeadId(null)} />
              <div className="fixed right-0 top-0 z-[70] h-full w-full max-w-4xl">
                <LeadFullPanel
                  leadId={selectedLeadId}
                  teamMembers={teamMembers}
                  isAdmin={isAdmin}
                  currentUserId={currentUserId}
                  canEditBatch={isAdmin}
                  onClose={() => setSelectedLeadId(null)}
                  onLeadChange={patch => {
                    if (patch.status) {
                      setBatchLeads(prev => prev.map(l =>
                        l.id === selectedLeadId ? { ...l, status: patch.status! } : l
                      ))
                    }
                  }}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
