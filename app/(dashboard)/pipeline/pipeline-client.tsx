'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, GripVertical, Building2, Phone,
  X, Mail, Globe, ExternalLink, ChevronDown, Search,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  INTEREST_CONFIG, ALL_INTEREST_STATUSES,
  STATUS_CONFIG, ALL_STATUSES,
} from '@/components/leads/status-config'
import type { InterestStatus } from '@/types/database'
import type { LeadStatus } from '@/components/leads/types'

// ── Types ─────────────────────────────────────────────────────────────────
interface PipelineStage {
  id: string; name: string; color: string; position: number
  is_won: boolean; is_lost: boolean; workspace_id: string
  created_at: string; updated_at: string
}

interface PipelineLead {
  id: string; first_name: string | null; last_name: string | null
  email: string; company: string | null; title: string | null
  phone: string | null; status: string; interest_status: InterestStatus
  pipeline_stage_id: string | null; assigned_to: string | null
  batch_id: string | null; created_at: string; updated_at: string
}

interface Props {
  stages: PipelineStage[]; initialLeads: PipelineLead[]
  workspaceId: string; isAdmin: boolean
}

// ── Component ─────────────────────────────────────────────────────────────
export default function PipelineClient({ stages, initialLeads, isAdmin }: Props) {
  const router = useRouter()
  const [leads,         setLeads]         = React.useState<PipelineLead[]>(initialLeads)
  const [draggingId,    setDraggingId]    = React.useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = React.useState<string | null>(null)
  const [search,        setSearch]        = React.useState('')
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)
  const didDragRef = React.useRef(false)

  React.useEffect(() => { setLeads(initialLeads) }, [initialLeads])
  React.useEffect(() => { router.refresh() }, []) // eslint-disable-line

  const leadsByStage = React.useMemo(() => {
    const q = search.toLowerCase()
    const filtered = q
      ? leads.filter(l => [l.first_name, l.last_name, l.email, l.company]
          .filter(Boolean).join(' ').toLowerCase().includes(q))
      : leads

    const map = new Map<string | null, PipelineLead[]>()
    for (const s of stages) map.set(s.id, [])
    map.set(null, [])
    for (const lead of filtered) {
      const sid = lead.pipeline_stage_id
      if (sid && map.has(sid)) map.get(sid)!.push(lead)
      else map.get(null)!.push(lead)
    }
    return map
  }, [leads, stages, search])

  function patchLead(leadId: string, patch: Partial<PipelineLead>) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l))
  }

  function handleDragStart(e: React.DragEvent, leadId: string) {
    didDragRef.current = true
    setDraggingId(leadId)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragEnd() {
    setDraggingId(null); setDragOverStage(null)
    setTimeout(() => { didDragRef.current = false }, 0)
  }
  function handleDragOver(e: React.DragEvent, stageId: string) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stageId)
  }
  function handleDragLeave() { setDragOverStage(null) }

  async function handleDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault(); setDragOverStage(null)
    if (!draggingId) return
    const lead = leads.find(l => l.id === draggingId)
    if (!lead || lead.pipeline_stage_id === stageId) return
    setLeads(prev => prev.map(l => l.id === draggingId ? { ...l, pipeline_stage_id: stageId } : l))
    setDraggingId(null)
    try {
      await fetch(`/api/leads/${draggingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage_id: stageId }),
      })
      router.refresh()
    } catch {
      setLeads(prev => prev.map(l => l.id === draggingId ? { ...l, pipeline_stage_id: lead.pipeline_stage_id } : l))
    }
  }

  const totalLeads = leads.length
  const unassigned = leadsByStage.get(null)?.length ?? 0

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-background sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalLeads.toLocaleString()} leads
            {unassigned > 0 && <span className="text-amber-500 font-medium"> · {unassigned} unassigned</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search leads…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-52 rounded-lg border border-border bg-muted/40 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background transition-colors"
            />
          </div>
          {/* Add Lead */}
          <Link
            href="/leads"
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add Lead</span>
          </Link>
        </div>
      </div>

      {/* ── Kanban board ── */}
      <div className="flex-1 overflow-x-auto">
        <div
          className="flex gap-5 p-6 min-h-full items-start"
          style={{ minWidth: `${stages.length * 320 + 96}px` }}
        >
          {stages.map(stage => {
            const stageLeads = leadsByStage.get(stage.id) ?? []
            const isOver     = dragOverStage === stage.id

            return (
              <div
                key={stage.id}
                className={cn(
                  'flex flex-col w-[300px] shrink-0 rounded-2xl border-2 transition-all duration-150',
                  isOver ? 'border-primary/60 bg-primary/3 shadow-lg shadow-primary/10' : 'border-transparent bg-muted/40'
                )}
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, stage.id)}
              >
                {/* Stage header */}
                <div
                  className="px-4 pt-4 pb-3 rounded-t-2xl"
                  style={{ borderTop: `3px solid ${stage.color}` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-sm font-semibold truncate">{stage.name}</span>
                      {stage.is_won  && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 shrink-0">WON</span>}
                      {stage.is_lost && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 shrink-0">LOST</span>}
                    </div>
                    <span className="ml-2 shrink-0 min-w-[24px] h-6 flex items-center justify-center rounded-full bg-card border border-border text-xs font-bold text-foreground">
                      {stageLeads.length}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5 max-h-[calc(100vh-220px)]">
                  {stageLeads.length === 0 ? (
                    <div className={cn(
                      'flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed text-sm transition-colors',
                      isOver ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground'
                    )}>
                      {isOver ? (
                        <><ArrowRight className="h-5 w-5 mb-1" /> Drop here</>
                      ) : 'No leads in this stage'}
                    </div>
                  ) : (
                    stageLeads.map(lead => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        isDragging={draggingId === lead.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onOpen={() => { if (!didDragRef.current) setSelectedLeadId(lead.id) }}
                      />
                    ))
                  )}
                </div>

                {/* Add lead footer */}
                <div className="px-3 pb-3">
                  <Link
                    href={`/leads?pipeline_stage=${stage.id}`}
                    className="flex items-center justify-center gap-2 w-full h-10 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Add lead
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Lead drawer ── */}
      {selectedLeadId && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelectedLeadId(null)} />
          <LeadDrawer
            leadId={selectedLeadId}
            onClose={() => setSelectedLeadId(null)}
            onLeadChange={patch => patchLead(selectedLeadId, patch)}
          />
        </>
      )}
    </div>
  )
}

// ── Lead card ─────────────────────────────────────────────────────────────
function LeadCard({
  lead, isDragging, onDragStart, onDragEnd, onOpen,
}: {
  lead: PipelineLead; isDragging: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void; onOpen: () => void
}) {
  const name         = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  const interestMeta = INTEREST_CONFIG[lead.interest_status as InterestStatus]
  const statusMeta   = STATUS_CONFIG[lead.status as LeadStatus] ?? null

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'group relative rounded-xl border-2 bg-card p-4 cursor-pointer select-none',
        'transition-all duration-150',
        isDragging
          ? 'opacity-40 scale-95 border-primary/40 shadow-none cursor-grabbing'
          : 'border-border hover:border-primary/40 hover:shadow-md hover:shadow-black/5 hover:-translate-y-0.5'
      )}
    >
      {/* Drag handle — always faintly visible */}
      <div className="absolute right-3 top-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Name */}
      <p className="font-semibold text-[15px] leading-snug pr-6 truncate mb-1">
        {name}
      </p>

      {/* Company or title */}
      {lead.company && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{lead.company}</span>
        </div>
      )}

      {/* Phone — tap to call */}
      {lead.phone && (
        <a
          href={`tel:${lead.phone}`}
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mb-2 w-fit"
        >
          <Phone className="h-3 w-3 shrink-0" />
          {lead.phone}
        </a>
      )}

      {/* Badges row */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {statusMeta && (
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap',
            statusMeta.badge
          )}>
            {statusMeta.label}
          </span>
        )}
        <span className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap',
          interestMeta.badge
        )}>
          {interestMeta.label}
        </span>
      </div>
    </div>
  )
}

// ── Lead drawer ────────────────────────────────────────────────────────────
interface FullLead {
  id: string; first_name: string | null; last_name: string | null
  email: string; phone: string | null; company: string | null
  title: string | null; website: string | null
  status: LeadStatus; interest_status: InterestStatus
}

function LeadDrawer({
  leadId, onClose, onLeadChange,
}: {
  leadId: string; onClose: () => void; onLeadChange: (patch: Partial<PipelineLead>) => void
}) {
  const [lead,    setLead]    = React.useState<FullLead | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    setLoading(true); setLead(null)
    fetch(`/api/leads/${leadId}`)
      .then(r => r.json()).then(d => setLead(d.lead ?? null))
      .catch(console.error).finally(() => setLoading(false))
  }, [leadId])

  async function changeStatus(status: LeadStatus) {
    if (!lead) return
    setLead(l => l ? { ...l, status } : l); onLeadChange({ status })
    await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).catch(console.error)
  }
  async function changeInterest(interest_status: InterestStatus) {
    if (!lead) return
    setLead(l => l ? { ...l, interest_status } : l); onLeadChange({ interest_status })
    await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interest_status }) }).catch(console.error)
  }

  const name         = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email : '…'
  const statusMeta   = lead ? STATUS_CONFIG[lead.status] : null
  const interestMeta = lead ? INTEREST_CONFIG[lead.interest_status] : null

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/30 px-5 py-4">
        <div className="min-w-0">
          <p className="font-bold text-base leading-tight truncate">{name}</p>
          {lead?.company && <p className="mt-0.5 text-sm text-muted-foreground truncate">{lead.company}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 mt-0.5">
          <Link href={`/leads/${leadId}`}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border"
            title="Full profile">
            <ExternalLink className="h-3.5 w-3.5" /> Profile
          </Link>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      ) : lead ? (
        <div className="flex-1 overflow-y-auto">
          {/* Status + Interest */}
          <div className="px-5 py-4 border-b border-border space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity',
                    statusMeta?.badge
                  )}>
                    {statusMeta?.label} <ChevronDown className="h-3 w-3 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" minWidth="170px">
                  <DropdownMenuLabel>Change status</DropdownMenuLabel>
                  {ALL_STATUSES.map(s => {
                    const m = STATUS_CONFIG[s]
                    return (
                      <DropdownMenuItem key={s} onClick={() => changeStatus(s)}
                        className={cn(s === lead.status && 'opacity-50 cursor-default')}>
                        <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />
                        {m.label}
                        {s === lead.status && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity',
                    interestMeta?.badge
                  )}>
                    {interestMeta?.label} <ChevronDown className="h-3 w-3 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" minWidth="160px">
                  <DropdownMenuLabel>Interest level</DropdownMenuLabel>
                  {ALL_INTEREST_STATUSES.map(s => {
                    const m = INTEREST_CONFIG[s]
                    return (
                      <DropdownMenuItem key={s} onClick={() => changeInterest(s)}
                        className={cn(s === lead.interest_status && 'opacity-50 cursor-default')}>
                        <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />
                        {m.label}
                        {s === lead.interest_status && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Contact info */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Contact</p>
            <a href={`tel:${lead.phone}`}
              className={cn(
                'flex items-center gap-3 w-full rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-muted/50 hover:border-primary/30 transition-all',
                !lead.phone && 'opacity-40 pointer-events-none'
              )}>
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              {lead.phone || 'No phone'}
            </a>
            <a href={`mailto:${lead.email}`}
              className="flex items-center gap-3 w-full rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-muted/50 hover:border-primary/30 transition-all truncate">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{lead.email}</span>
            </a>
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 w-full rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-muted/50 hover:border-primary/30 transition-all">
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="border-t border-border px-5 py-4">
        <Link href={`/leads/${leadId}`}
          className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
          Open Full Profile <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
