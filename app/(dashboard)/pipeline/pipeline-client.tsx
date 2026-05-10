'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, GripVertical, Building2, Phone,
  X, Mail, Globe, ExternalLink, ChevronDown, Search,
  Clock, User,
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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return '1d ago'
  if (d < 7)  return `${d}d ago`
  if (d < 30) return `${Math.floor(d/7)}w ago`
  return `${Math.floor(d/30)}mo ago`
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function PipelineClient({ stages, initialLeads }: Props) {
  const router = useRouter()
  const [leads,          setLeads]          = React.useState<PipelineLead[]>(initialLeads)
  const [draggingId,     setDraggingId]     = React.useState<string | null>(null)
  const [dragOverStage,  setDragOverStage]  = React.useState<string | null>(null)
  const [search,         setSearch]         = React.useState('')
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

  function patchLead(id: string, patch: Partial<PipelineLead>) {
    setLeads(p => p.map(l => l.id === id ? { ...l, ...patch } : l))
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    didDragRef.current = true; setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragEnd() {
    setDraggingId(null); setDragOverStage(null)
    setTimeout(() => { didDragRef.current = false }, 0)
  }
  function handleDragOver(e: React.DragEvent, sid: string) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverStage(sid)
  }
  function handleDragLeave() { setDragOverStage(null) }
  async function handleDrop(e: React.DragEvent, sid: string) {
    e.preventDefault(); setDragOverStage(null)
    if (!draggingId) return
    const lead = leads.find(l => l.id === draggingId)
    if (!lead || lead.pipeline_stage_id === sid) return
    setLeads(p => p.map(l => l.id === draggingId ? { ...l, pipeline_stage_id: sid } : l))
    setDraggingId(null)
    try {
      await fetch(`/api/leads/${draggingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage_id: sid }),
      })
      router.refresh()
    } catch {
      setLeads(p => p.map(l => l.id === draggingId ? { ...l, pipeline_stage_id: lead.pipeline_stage_id } : l))
    }
  }

  const totalLeads   = leads.length
  const unassigned   = leadsByStage.get(null)?.length ?? 0
  const stageCounts  = stages.map(s => ({ id: s.id, count: leadsByStage.get(s.id)?.length ?? 0 }))
  const totalInStages = stageCounts.reduce((a, b) => a + b.count, 0)

  return (
    <div className="flex flex-col h-full min-h-screen" style={{ background: '#f0f2f5' }}>

      {/* ── Top header ── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border bg-background sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-bold tracking-tight leading-none">Pipeline</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {totalLeads.toLocaleString()} leads across {stages.length} stages
              {unassigned > 0 && <span className="text-amber-500 font-medium"> · {unassigned} unassigned</span>}
            </p>
          </div>
          {/* Stage distribution bar */}
          {totalInStages > 0 && (
            <div className="hidden lg:flex items-center gap-1 ml-4">
              {stageCounts.filter(s => s.count > 0).map(s => {
                const stage = stages.find(st => st.id === s.id)!
                const pct   = Math.round(s.count / totalInStages * 100)
                return (
                  <div key={s.id} title={`${stage.name}: ${s.count}`}
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.max(pct, 4) * 1.5}px`, background: stage.color }} />
                )
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-44 rounded-lg border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <Link href="/leads"
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Lead
          </Link>
        </div>
      </div>

      {/* ── Board ── */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 px-5 py-5 min-h-full items-start"
          style={{ minWidth: `${stages.length * 284 + 80}px` }}>

          {stages.map(stage => {
            const stageLeads = leadsByStage.get(stage.id) ?? []
            const isOver     = dragOverStage === stage.id

            return (
              <div key={stage.id}
                className={cn(
                  'flex flex-col w-[268px] shrink-0 rounded-xl transition-all duration-150',
                  isOver ? 'ring-2 ring-primary/50 ring-offset-1' : ''
                )}
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, stage.id)}
              >
                {/* ── Column header ── */}
                <div className="rounded-t-xl bg-card border border-border border-b-0 px-3.5 pt-3 pb-2.5"
                  style={{ borderTop: `3px solid ${stage.color}` }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-bold truncate">{stage.name}</span>
                      {stage.is_won  && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">WON</span>}
                      {stage.is_lost && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0">LOST</span>}
                    </div>
                    <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
                      {stageLeads.length}
                    </span>
                  </div>
                  {/* Stage color progress bar */}
                  <div className="h-0.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: totalInStages > 0 ? `${Math.round(stageLeads.length / totalInStages * 100)}%` : '0%',
                        background: stage.color,
                      }} />
                  </div>
                </div>

                {/* ── Cards area ── */}
                <div className={cn(
                  'flex-1 overflow-y-auto space-y-2 p-2 max-h-[calc(100vh-200px)]',
                  'border-x border-border bg-muted/30',
                  isOver && 'bg-primary/3'
                )}>
                  {stageLeads.length === 0 ? (
                    <div className={cn(
                      'flex items-center justify-center h-20 rounded-lg border-2 border-dashed text-xs text-muted-foreground transition-colors',
                      isOver ? 'border-primary/50 text-primary bg-primary/5' : 'border-border'
                    )}>
                      {isOver ? '↓ Drop here' : 'Empty'}
                    </div>
                  ) : stageLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      stageColor={stage.color}
                      isDragging={draggingId === lead.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onOpen={() => { if (!didDragRef.current) setSelectedLeadId(lead.id) }}
                    />
                  ))}
                </div>

                {/* ── Add lead footer ── */}
                <Link href={`/leads?pipeline_stage=${stage.id}`}
                  className={cn(
                    'flex items-center justify-center gap-1.5 w-full h-9 rounded-b-xl border border-border border-t-0 bg-card',
                    'text-xs font-medium text-muted-foreground',
                    'hover:text-primary hover:bg-primary/5 transition-colors'
                  )}
                >
                  <Plus className="h-3.5 w-3.5" /> Add lead
                </Link>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Drawer ── */}
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
  lead, stageColor, isDragging, onDragStart, onDragEnd, onOpen,
}: {
  lead: PipelineLead; stageColor: string; isDragging: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void; onOpen: () => void
}) {
  const name         = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  const interestMeta = INTEREST_CONFIG[lead.interest_status as InterestStatus]
  const statusMeta   = STATUS_CONFIG[lead.status as LeadStatus]

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'group relative bg-card rounded-lg cursor-pointer select-none',
        'border border-border/80',
        'transition-all duration-100',
        isDragging
          ? 'opacity-40 scale-[0.97] shadow-none cursor-grabbing'
          : 'hover:shadow-md hover:shadow-black/8 hover:border-border hover:-translate-y-px'
      )}
      style={{ borderLeft: `3px solid ${stageColor}` }}
    >
      {/* Drag handle */}
      <div className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-30 transition-opacity">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <div className="px-3 pt-3 pb-2.5">
        {/* Name */}
        <p className="font-semibold text-[13.5px] leading-snug truncate pr-5 mb-0.5">
          {name}
        </p>

        {/* Company */}
        {lead.company && (
          <p className="text-[12px] text-muted-foreground truncate mb-2 flex items-center gap-1">
            <Building2 className="h-3 w-3 shrink-0" />{lead.company}
          </p>
        )}

        {/* Divider */}
        {(lead.phone || lead.company) && <div className="border-t border-border/50 mb-2" />}

        {/* Phone — click to call, stopPropagation so card doesn't open drawer */}
        {lead.phone && (
          <a href={`tel:${lead.phone}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary transition-colors mb-1 w-fit">
            <Phone className="h-3 w-3 shrink-0" />{lead.phone}
          </a>
        )}

        {/* Badges + time */}
        <div className="flex items-center justify-between gap-1.5 mt-2">
          <div className="flex items-center gap-1 flex-wrap">
            {statusMeta && (
              <span className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border',
                statusMeta.badge
              )}>
                {statusMeta.label}
              </span>
            )}
            <span className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border',
              interestMeta.badge
            )}>
              {interestMeta.label}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/60 shrink-0 flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />{timeAgo(lead.created_at)}
          </span>
        </div>
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
    <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[360px] flex-col border-l border-border bg-card shadow-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 bg-muted/20">
        <div className="min-w-0 flex-1">
          {/* Avatar + name */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
              {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[15px] leading-tight truncate">{name}</p>
              {lead?.company && <p className="text-sm text-muted-foreground truncate">{lead.company}</p>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 mt-0.5">
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
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

          {/* Status & Interest */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Lead status</p>
            <div className="grid grid-cols-2 gap-2">
              {/* Status */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1.5">Status</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn(
                      'w-full flex items-center justify-between gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity',
                      statusMeta?.badge
                    )}>
                      <span>{statusMeta?.label}</span>
                      <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" minWidth="170px">
                    <DropdownMenuLabel>Change status</DropdownMenuLabel>
                    {ALL_STATUSES.map(s => {
                      const m = STATUS_CONFIG[s]
                      return (
                        <DropdownMenuItem key={s} onClick={() => changeStatus(s)}
                          className={cn(s === lead.status && 'opacity-50 cursor-default')}>
                          <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />{m.label}
                          {s === lead.status && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Interest */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1.5">Interest</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn(
                      'w-full flex items-center justify-between gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity',
                      interestMeta?.badge
                    )}>
                      <span>{interestMeta?.label}</span>
                      <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" minWidth="160px">
                    <DropdownMenuLabel>Interest level</DropdownMenuLabel>
                    {ALL_INTEREST_STATUSES.map(s => {
                      const m = INTEREST_CONFIG[s]
                      return (
                        <DropdownMenuItem key={s} onClick={() => changeInterest(s)}
                          className={cn(s === lead.interest_status && 'opacity-50 cursor-default')}>
                          <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />{m.label}
                          {s === lead.interest_status && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Contact info */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Contact info</p>
            <div className="space-y-2">
              <a href={`tel:${lead.phone}`}
                className={cn(
                  'flex items-center gap-3 w-full rounded-xl bg-muted/50 border border-border px-4 py-3',
                  'text-sm font-medium hover:bg-muted hover:border-primary/30 transition-all',
                  !lead.phone && 'opacity-40 pointer-events-none'
                )}>
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                {lead.phone || 'No phone number'}
              </a>
              <a href={`mailto:${lead.email}`}
                className="flex items-center gap-3 w-full rounded-xl bg-muted/50 border border-border px-4 py-3 text-sm font-medium hover:bg-muted hover:border-primary/30 transition-all">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{lead.email}</span>
              </a>
              {lead.website && (
                <a href={lead.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full rounded-xl bg-muted/50 border border-border px-4 py-3 text-sm font-medium hover:bg-muted hover:border-primary/30 transition-all">
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="border-t border-border px-5 py-4 space-y-2">
        <Link href={`/leads/${leadId}`}
          className="flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
          Open Full Profile <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
