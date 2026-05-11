'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, GripVertical, Search, Columns3, List,
  MoreHorizontal, TrendingUp, Users, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { STATUS_CONFIG, INTEREST_CONFIG } from '@/components/leads/status-config'
import { LeadFullPanel } from '@/components/leads/lead-full-panel'
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
  phone: string | null; status: string; interest_status: string
  pipeline_stage_id: string | null; assigned_to: string | null
  batch_id: string | null; created_at: string; updated_at: string
  last_contacted_at: string | null
}
interface Props {
  stages: PipelineStage[]; initialLeads: PipelineLead[]
  workspaceId: string; isAdmin: boolean; currentUserId: string
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return '1d ago'
  if (d < 7)   return `${d}d ago`
  if (d < 30)  return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}


export default function PipelineClient({ stages, initialLeads, isAdmin, currentUserId }: Props) {
  const router = useRouter()
  const [leads,          setLeads]          = React.useState<PipelineLead[]>(initialLeads)
  const [draggingId,     setDraggingId]     = React.useState<string | null>(null)
  const [dragOverStage,  setDragOverStage]  = React.useState<string | null>(null)
  const [search,         setSearch]         = React.useState('')
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)
  const [pipelineView, setPipelineView] = React.useState<'kanban' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('pipeline_view_mode')
      return saved === 'list' ? 'list' : 'kanban'
    } catch {
      return 'kanban'
    }
  })
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

  // ── Derived stats ─────────────────────────────────────────────────────
  const contactedCount  = leads.filter(l => ['called','voicemail','no_answer','contacted','replied'].includes(l.status)).length
  const interestedCount = leads.filter(l => l.interest_status === 'interested').length

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-card sticky top-0 z-10">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Sales Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalLeads.toLocaleString()} leads · {stages.length} stages
            {unassigned > 0 && <span className="text-amber-500 font-medium"> · {unassigned.toLocaleString()} unassigned</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search leads…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-52 rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button type="button"
              onClick={() => { setPipelineView('kanban'); try { localStorage.setItem('pipeline_view_mode', 'kanban') } catch {} }}
              className={cn('flex h-9 items-center gap-1.5 px-3.5 text-sm font-medium transition-colors',
                pipelineView === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              )}>
              <Columns3 className="h-4 w-4" /> Kanban
            </button>
            <div className="w-px bg-border" />
            <button type="button"
              onClick={() => { setPipelineView('list'); try { localStorage.setItem('pipeline_view_mode', 'list') } catch {} }}
              className={cn('flex h-9 items-center gap-1.5 px-3.5 text-sm font-medium transition-colors',
                pipelineView === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              )}>
              <List className="h-4 w-4" /> List
            </button>
          </div>
          <Button asChild size="sm">
            <Link href="/leads"><Plus className="h-4 w-4" /> Add Lead</Link>
          </Button>
        </div>
      </div>

      {/* ── KPI stat cards ── */}
      <div className="grid grid-cols-3 gap-4 px-6 py-5 border-b border-border bg-card">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Total Leads"
          value={totalLeads.toLocaleString()}
          sub={`${stages.length} stages`}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Contacted"
          value={contactedCount.toLocaleString()}
          sub={`${totalLeads > 0 ? Math.round((contactedCount / totalLeads) * 100) : 0}% of pipeline`}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Interested"
          value={interestedCount.toLocaleString()}
          sub={`${totalLeads > 0 ? Math.round((interestedCount / totalLeads) * 100) : 0}% conversion rate`}
          accent
        />
      </div>

      {/* ── Views ── */}
      {pipelineView === 'kanban' ? (
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-5 px-6 py-6 min-h-full items-start"
          style={{ minWidth: `${stages.length * 300 + 96}px` }}>

          {stages.map(stage => {
            const stageLeads = leadsByStage.get(stage.id) ?? []
            const isOver     = dragOverStage === stage.id

            return (
              <div key={stage.id} className="flex flex-col w-[276px] shrink-0">

                {/* Column header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold">{stage.name}</span>
                  <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground tabular-nums">
                    {stageLeads.length}
                  </span>
                  {stage.is_won  && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500 text-white">WON</span>}
                  {stage.is_lost && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500 text-white">LOST</span>}
                </div>

                {/* Drop zone */}
                <div
                  className={cn(
                    'flex flex-col gap-3 flex-1 min-h-[120px] rounded-2xl p-1 transition-colors',
                    isOver && 'bg-primary/5 ring-2 ring-primary/20 ring-inset',
                  )}
                  onDragOver={e => handleDragOver(e, stage.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, stage.id)}
                >
                  <div className="flex flex-col gap-3 flex-1 overflow-y-auto max-h-[calc(100vh-300px)]">
                    {stageLeads.length === 0 && (
                      <div className={cn(
                        'flex items-center justify-center h-20 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition-colors',
                        isOver ? 'border-primary/40 text-primary' : 'border-border/50',
                      )}>
                        {isOver ? 'Drop here' : 'No leads'}
                      </div>
                    )}
                    {stageLeads.map(lead => (
                      <KanbanCard
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

                  {/* Add lead */}
                  <Link
                    href="/leads"
                    className="flex items-center gap-1.5 w-full px-3 py-2.5 rounded-xl border border-dashed border-border/60 text-xs font-medium text-muted-foreground hover:bg-card hover:border-border hover:text-foreground transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add lead
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {stages.map((stage) => {
            const stageLeads = leadsByStage.get(stage.id) ?? []
            const isOver = dragOverStage === stage.id
            return (
              <div
                key={stage.id}
                className={cn('rounded-2xl border border-border bg-card transition-colors', isOver && 'ring-2 ring-primary/25 bg-primary/5')}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <p className="text-sm font-semibold">{stage.name}</p>
                    <span className="text-xs text-muted-foreground">{stageLeads.length}</span>
                  </div>
                </div>
                {stageLeads.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">No leads in this stage.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {stageLeads.map((lead) => {
                      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
                      return (
                        <button
                          key={lead.id}
                          type="button"
                          draggable
                          onDragStart={(e) => handleDragStart(e, lead.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{name}</p>
                            <p className="truncate text-xs text-muted-foreground">{lead.company ?? 'No company'} · {lead.email}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {lead.last_contacted_at ? `Last contacted ${timeAgo(lead.last_contacted_at)}` : `Added ${timeAgo(lead.created_at)}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Side panel ── */}
      {selectedLeadId && (
        <>
          <div className="fixed inset-0 z-40 bg-black/25" onClick={() => setSelectedLeadId(null)} />
          <LeadFullPanel
            leadId={selectedLeadId}
            teamMembers={[]}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            canEditBatch={isAdmin}
            onClose={() => setSelectedLeadId(null)}
            onLeadChange={patch => patchLead(selectedLeadId, patch)}
          />
        </>
      )}
    </div>
  )
}

// ── Kanban card ───────────────────────────────────────────────────────────
function KanbanCard({
  lead, stageColor, isDragging, onDragStart, onDragEnd, onOpen,
}: {
  lead: PipelineLead; stageColor: string; isDragging: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void; onOpen: () => void
}) {
  const name         = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  const initials     = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const interestMeta = INTEREST_CONFIG[lead.interest_status as InterestStatus]
  const dateLabel    = lead.last_contacted_at
    ? new Date(lead.last_contacted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date(lead.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  // Deterministic pastel for the avatar background
  const avatarColors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444']
  const avatarBg = avatarColors[(name.charCodeAt(0) ?? 0) % avatarColors.length]

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'group bg-card rounded-xl border border-border/50 shadow-sm',
        'cursor-pointer select-none transition-all duration-150',
        isDragging
          ? 'opacity-40 scale-[0.97] shadow-none cursor-grabbing'
          : 'hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:border-border hover:-translate-y-px',
      )}
    >
      <div className="p-4">

        {/* Row 1: name + ··· menu */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
            {name}
          </p>
          <button
            type="button"
            onClick={e => e.stopPropagation()}
            className="shrink-0 mt-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Row 2: company */}
        <p className="text-[11px] text-muted-foreground truncate mb-3">
          {lead.company ?? <span className="italic opacity-60">No company</span>}
        </p>

        {/* Row 3: status dot + date  (mirrors "$value · date" from screenshot) */}
        <div className="flex items-center gap-1.5 mb-3.5">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
          <span className="text-xs text-muted-foreground">{dateLabel}</span>
          {lead.phone && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <a
                href={`tel:${lead.phone}`}
                onClick={e => e.stopPropagation()}
                className="text-xs text-muted-foreground hover:text-primary transition-colors truncate"
              >
                {lead.phone}
              </a>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border/60 mb-3" />

        {/* Footer: avatar + name + interest badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ backgroundColor: avatarBg }}
            >
              {initials}
            </div>
            <span className="text-xs text-muted-foreground truncate">
              {lead.first_name ?? lead.email.split('@')[0]}
            </span>
          </div>

          {interestMeta && (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border shrink-0',
              interestMeta.badge,
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', interestMeta.dot)} />
              {interestMeta.label}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent }: {
  icon:   React.ReactNode
  label:  string
  value:  string
  sub:    string
  accent?: boolean
}) {
  return (
    <div className={cn(
      'rounded-xl border p-4 transition-colors',
      accent
        ? 'border-emerald-200 bg-emerald-50/60'
        : 'border-border bg-background',
    )}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <span className={accent ? 'text-emerald-600' : ''}>{icon}</span>
        {label}
      </div>
      <p className={cn(
        'text-2xl font-bold tracking-tight',
        accent ? 'text-emerald-700' : 'text-foreground',
      )}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  )
}
