'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, GripVertical, Building2, Phone,
  X, Mail, Globe, ExternalLink, ChevronDown, Search,
  Clock, MoreHorizontal,
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
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return '1d ago'
  if (d < 7)   return `${d}d ago`
  if (d < 30)  return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

// Lighten a hex color for the column header background
function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function PipelineClient({ stages, initialLeads }: Props) {
  const router = useRouter()
  const [leads,          setLeads]          = React.useState<PipelineLead[]>(initialLeads)
  const [draggingId,     setDraggingId]     = React.useState<string | null>(null)
  const [dragOverStage,  setDragOverStage]  = React.useState<string | null>(null)
  const [search,         setSearch]         = React.useState('')
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)
  const didDragRef = React.useRef(false)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeads(initialLeads)
  }, [initialLeads])

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

  const totalLeads = leads.length
  const unassigned = leadsByStage.get(null)?.length ?? 0

  return (
    <div className="flex flex-col h-full min-h-screen">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border/70 glass-panel sticky top-0 z-10">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">Sales Pipeline</h1>
          <p className="text-[11px] text-muted-foreground/90">
            {totalLeads.toLocaleString()} leads · {stages.length} stages
            {unassigned > 0 && <span className="text-amber-500 font-medium"> · {unassigned} unassigned</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search leads…" value={search}
              onChange={e => setSearch(e.target.value)}
            className="h-8 w-48 rounded-xl border border-border/80 bg-white/75 pl-8 pr-3 text-[13px] text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <Link href="/leads"
            className="flex items-center gap-1.5 h-8 px-3.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors shadow-primary-glow">
            <Plus className="h-3.5 w-3.5" /> Add Lead
          </Link>
        </div>
      </div>

      {/* ── Board ── */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 px-6 py-6 min-h-full items-start"
          style={{ minWidth: `${stages.length * 300 + 96}px` }}>

          {stages.map(stage => {
            const stageLeads = leadsByStage.get(stage.id) ?? []
            const isOver     = dragOverStage === stage.id
            const headerBg   = stage.color.startsWith('#') ? hexToRgba(stage.color, 0.1) : stage.color

            return (
              <div key={stage.id}
                className={cn(
                  'flex flex-col w-[288px] shrink-0 rounded-[20px] transition-all duration-150',
                  'glass-panel shadow-card',
                  isOver ? 'shadow-xl ring-2 ring-primary/25' : 'hover:shadow-lg'
                )}
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, stage.id)}
              >
                {/* ── Stage header ── */}
                <div className="rounded-t-[20px] px-4 pt-4 pb-3"
                  style={{ background: headerBg }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }} />
                        <span className="text-[13px] font-semibold truncate leading-tight">
                          {stage.name}
                        </span>
                        {stage.is_won  && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white shrink-0">WON</span>}
                        {stage.is_lost && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-red-500/90 text-white shrink-0">LOST</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground pl-4">
                        {stageLeads.length} {stageLeads.length === 1 ? 'lead' : 'leads'}
                      </p>
                    </div>
                    <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/60 transition-colors mt-0.5">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Thin color divider */}
                <div className="h-0.5 w-full" style={{ backgroundColor: stage.color }} />

                {/* ── Cards ── */}
                <div className={cn(
                  'flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[calc(100vh-210px)]',
                  isOver && 'bg-primary/5 rounded-b-[20px]'
                )}>
                  {stageLeads.length === 0 ? (
                    <div className={cn(
                      'flex items-center justify-center h-24 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition-colors',
                      isOver ? 'border-primary/55 text-primary bg-primary/5' : 'border-border/80 bg-white/40'
                    )}>
                      {isOver ? 'Drop to add here' : 'No leads yet'}
                    </div>
                  ) : (
                    stageLeads.map(lead => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        stageColor={stage.color}
                        isDragging={draggingId === lead.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onOpen={() => { if (!didDragRef.current) setSelectedLeadId(lead.id) }}
                      />
                    ))
                  )}
                </div>

                {/* ── Add lead ── */}
                <div className="p-3 pt-0">
                  <Link href={`/leads?pipeline_stage=${stage.id}`}
                    className="flex items-center justify-center gap-1.5 w-full h-9 rounded-xl border-2 border-dashed border-border/80 text-[12px] font-medium text-muted-foreground hover:border-primary/45 hover:text-foreground hover:bg-white/55 transition-all">
                    <Plus className="h-3.5 w-3.5" /> Add lead
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Drawer ── */}
      {selectedLeadId && (
        <>
          <div className="fixed inset-0 z-40 bg-black/25" onClick={() => setSelectedLeadId(null)} />
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
        'group relative rounded-2xl cursor-pointer select-none',
        'glass-panel shadow-card border border-white/70',
        'transition-all duration-100',
        isDragging
          ? 'opacity-40 scale-95 shadow-none cursor-grabbing rotate-1'
          : 'hover:shadow-lg hover:border-white hover:-translate-y-0.5'
      )}
    >
      {/* Left color accent */}
      <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
        style={{ backgroundColor: stageColor }} />

      {/* Drag handle */}
      <div className="absolute right-2.5 top-3 opacity-0 group-hover:opacity-30 transition-opacity">
        <GripVertical className="h-3.5 w-3.5 text-gray-400" />
      </div>

      <div className="pl-4 pr-8 pt-3.5 pb-3">
        {/* Name */}
        <p className="font-semibold text-[13.5px] leading-snug truncate mb-1 text-foreground">
          {name}
        </p>

        {/* Company */}
        {lead.company && (
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-2 truncate">
            <Building2 className="h-3 w-3 shrink-0" />
            {lead.company}
          </div>
        )}

        {/* Phone — click to call */}
        {lead.phone && (
          <a href={`tel:${lead.phone}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary transition-colors mb-2.5 w-fit">
            <Phone className="h-3 w-3 shrink-0" />
            {lead.phone}
          </a>
        )}

        {/* Separator */}
        <div className="border-t border-border/60 mb-2.5" />

        {/* Footer row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-wrap min-w-0">
            {statusMeta && (
              <span className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border',
                statusMeta.badge
              )}>
                {statusMeta.label}
              </span>
            )}
            <span className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border',
              interestMeta.badge
            )}>
              {interestMeta.label}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/80 shrink-0 flex items-center gap-0.5 whitespace-nowrap">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(lead.created_at)}
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const initials     = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[390px] flex-col glass-panel shadow-2xl border-l border-white/70">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary text-[13px] font-black">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[15px] leading-tight truncate text-gray-900">{name}</p>
            {lead?.company && <p className="text-[12px] text-gray-500 truncate">{lead.company}</p>}
          </div>
        </div>
        <button type="button" onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
        </div>
      ) : lead ? (
        <div className="flex-1 overflow-y-auto">

          {/* Status & Interest */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Lead status</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn(
                      'w-full flex items-center justify-between gap-1 rounded-xl border px-3 py-2 text-[11px] font-bold cursor-pointer hover:opacity-80 transition-opacity',
                      statusMeta?.badge
                    )}>
                      <span className="truncate">{statusMeta?.label}</span>
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
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Interest</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn(
                      'w-full flex items-center justify-between gap-1 rounded-xl border px-3 py-2 text-[11px] font-bold cursor-pointer hover:opacity-80 transition-opacity',
                      interestMeta?.badge
                    )}>
                      <span className="truncate">{interestMeta?.label}</span>
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
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Contact</p>
            <div className="space-y-2">
              <a href={`tel:${lead.phone}`}
                className={cn(
                  'flex items-center gap-3.5 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5',
                  'text-[13px] font-medium text-gray-700',
                  'hover:bg-gray-100 hover:border-gray-200 transition-all',
                  !lead.phone && 'opacity-40 pointer-events-none'
                )}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm">
                  <Phone className="h-3.5 w-3.5 text-gray-500" />
                </div>
                {lead.phone || 'No phone number'}
              </a>
              <a href={`mailto:${lead.email}`}
                className="flex items-center gap-3.5 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100 hover:border-gray-200 transition-all">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm">
                  <Mail className="h-3.5 w-3.5 text-gray-500" />
                </div>
                <span className="truncate">{lead.email}</span>
              </a>
              {lead.website && (
                <a href={lead.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3.5 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100 hover:border-gray-200 transition-all">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm">
                    <Globe className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="border-t border-gray-100 px-5 py-4">
        <Link href={`/leads/${leadId}`}
          className="flex items-center justify-center gap-2 w-full h-11 rounded-2xl bg-primary text-primary-foreground text-[13px] font-bold hover:bg-primary/90 transition-colors shadow-sm">
          Open Full Profile <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
