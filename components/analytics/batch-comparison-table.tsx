'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Layers, ChevronUp, ChevronDown, ChevronsUpDown, X, RefreshCw, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LeadFullPanel } from '@/components/leads/lead-full-panel'
import type { BatchRow } from './types'

type SortKey = 'lead_count'

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
  batches:        BatchRow[]
  loading?:       boolean
  isAdmin?:       boolean
  currentUserId?: string
  onDelete?:      (id: string) => void
}

export function BatchComparisonTable({ batches, loading, isAdmin, currentUserId, onDelete }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'lead_count', dir: 'desc' })
  const sorted = useMemo(() =>
    [...batches].sort((a, b) => {
      const d = sort.dir === 'asc' ? 1 : -1
      return (a[sort.key] > b[sort.key] ? 1 : -1) * d
    }), [batches, sort])

  const onSort = (key: SortKey) =>
    setSort(p => ({ key, dir: p.key === key && p.dir === 'desc' ? 'asc' : 'desc' }))

  const maxLeads = Math.max(...batches.map(b => b.lead_count), 1)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(e: React.MouseEvent, batch: BatchRow) {
    e.stopPropagation()
    if (!confirm(`Delete "${batch.name}" and all its leads? This cannot be undone.`)) return
    setDeletingId(batch.id)
    try {
      const res = await fetch(`/api/batches/${batch.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDelete?.(batch.id)
        if (openBatch?.id === batch.id) setOpenBatch(null)
      }
    } finally {
      setDeletingId(null)
    }
  }

  // Side panel state
  const [openBatch,    setOpenBatch]    = useState<BatchRow | null>(null)
  const [batchLeads,   setBatchLeads]   = useState<BatchLead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  async function openBatchPanel(batch: BatchRow) {
    setOpenBatch(batch)
    setBatchLeads([])
    setSelectedLeadId(null)
    setLeadsLoading(true)
    try {
      const res  = await fetch(`/api/batches/${batch.id}/leads`)
      const json = await res.json() as { data?: { leads: BatchLead[] }; error?: string }
      setBatchLeads(json.data?.leads ?? [])
    } catch {
      setBatchLeads([])
    } finally {
      setLeadsLoading(false)
    }
  }

  function closePanel() {
    setOpenBatch(null)
    setBatchLeads([])
    setSelectedLeadId(null)
  }

  const colCount = isAdmin ? 4 : 3 // batch | leads | added | (delete if admin)

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-5 w-5 text-foreground" />
            Batch comparison
            <Badge variant="secondary" className="ml-auto text-xs">{batches.length} batches</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Batch</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                    <button onClick={() => onSort('lead_count')} className="flex items-center gap-1 group hover:text-foreground">
                      Leads
                      {sort.key === 'lead_count'
                        ? sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />
                        : <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                      }
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Added</th>
                  {isAdmin && <th className="w-10 px-2 py-3" />}
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: colCount }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 w-16 rounded bg-muted" /></td>
                    ))}
                  </tr>
                ))}
                {!loading && sorted.map(b => (
                  <tr
                    key={b.id}
                    onClick={() => openBatchPanel(b)}
                    className={cn(
                      'border-b last:border-0 transition-colors cursor-pointer',
                      openBatch?.id === b.id
                        ? 'bg-primary/5'
                        : 'hover:bg-muted/30'
                    )}
                  >
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="font-medium truncate">{b.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <span className="font-semibold">{b.lead_count.toLocaleString()}</span>
                        <Progress value={Math.round((b.lead_count / maxLeads) * 100)} className="h-1 w-20" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(b.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </td>
                    {isAdmin && (
                      <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => void handleDelete(e, b)}
                          disabled={deletingId === b.id}
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                          title="Delete batch"
                        >
                          {deletingId === b.id
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!loading && sorted.length === 0 && (
                  <tr><td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">No batches found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Batch leads side panel */}
      {openBatch && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={closePanel} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Batch · {openBatch.lead_count.toLocaleString()} leads</p>
                <h2 className="text-lg font-semibold">{openBatch.name}</h2>
              </div>
              <button
                type="button"
                onClick={closePanel}
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
                            <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[160px]">{lead.email}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{lead.company ?? '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{lead.phone ?? '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground capitalize text-xs">{lead.status.replace(/_/g, ' ')}</td>
                            <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                              <a
                                href={`/leads/${lead.id}`}
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title="Open lead page"
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

          {/* Lead full panel on top */}
          {selectedLeadId && currentUserId && (
            <>
              <div className="fixed inset-0 z-[60] bg-black/20" onClick={() => setSelectedLeadId(null)} />
              <div className="fixed right-0 top-0 z-[70] h-full w-full max-w-4xl">
                <LeadFullPanel
                  leadId={selectedLeadId}
                  teamMembers={[]}
                  isAdmin={isAdmin ?? false}
                  currentUserId={currentUserId}
                  canEditBatch={isAdmin ?? false}
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
    </>
  )
}
