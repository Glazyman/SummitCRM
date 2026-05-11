'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Columns3, List,
  MoreHorizontal, TrendingUp, DollarSign, Calendar, Phone,
  BarChart3, Trophy, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { INTEREST_CONFIG } from '@/components/leads/status-config'
import { LeadFullPanel } from '@/components/leads/lead-full-panel'
import type { InterestStatus } from '@/types/database'

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
  /** Parsed revenue from questionnaire (0 if not filled) */
  pipeline_value: number
}
interface Props {
  stages: PipelineStage[]; initialLeads: PipelineLead[]
  workspaceId: string; isAdmin: boolean; currentUserId: string
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return '1d ago'
  if (d < 7)   return `${d}d ago`
  if (d < 30)  return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Deterministic pastel avatar bg
const AVATAR_COLORS = ['#f6c89f','#cfd6e4','#d8c2ec','#bfe2cf','#f3d3d3','#c2d9f0','#f7deb3']
function avatarColor(name: string) {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
}

export default function PipelineClient({ stages, initialLeads, isAdmin, currentUserId }: Props) {
  const router = useRouter()
  const [leads,          setLeads]          = React.useState<PipelineLead[]>(initialLeads)
  const [draggingId,     setDraggingId]     = React.useState<string | null>(null)
  const [dragOverStage,  setDragOverStage]  = React.useState<string | null>(null)
  const [search,         setSearch]         = React.useState('')
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)
  const [pipelineView,   setPipelineView]   = React.useState<'kanban' | 'list'>(() => {
    try { return localStorage.getItem('pipeline_view_mode') === 'list' ? 'list' : 'kanban' } catch { return 'kanban' }
  })
  const didDragRef = React.useRef(false)

  React.useEffect(() => { setLeads(initialLeads) }, [initialLeads])

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

  const totalLeads    = leads.filter(l => l.pipeline_stage_id !== null).length
  const unassigned    = leadsByStage.get(null)?.length ?? 0

  // Won stage IDs and lost stage IDs from stage metadata
  const wonStageIds  = new Set(stages.filter(s => s.is_won).map(s => s.id))
  const lostStageIds = new Set(stages.filter(s => s.is_lost).map(s => s.id))

  const dealsWon        = leads.filter(l => l.pipeline_stage_id && wonStageIds.has(l.pipeline_stage_id)).length
  const dealsInProgress = leads.filter(l => l.pipeline_stage_id && !wonStageIds.has(l.pipeline_stage_id) && !lostStageIds.has(l.pipeline_stage_id)).length

  // Pipeline value = sum of questionnaire revenue for all in-pipeline leads
  const pipelineValue = leads
    .filter(l => l.pipeline_stage_id !== null)
    .reduce((sum, l) => sum + (l.pipeline_value ?? 0), 0)

  const pipelineValueHasData = pipelineValue > 0

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'hsl(var(--background))' }}>

      {/* ── Page title + toolbar ── */}
      <div className="px-6 pt-6 pb-4 space-y-5">
        <h1 className="text-2xl font-bold tracking-[-0.025em]">Sales Pipeline</h1>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Total Deals"
            value={totalLeads.toLocaleString()}
            sub={{ bold: `${stages.length} stages`, rest: `· ${unassigned} unassigned` }}
          />
          <StatCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Pipeline Value"
            value={pipelineValueHasData ? fmtMoney(pipelineValue) : '—'}
            sub={{ bold: pipelineValueHasData ? '' : 'Fill questionnaire', rest: pipelineValueHasData ? 'from questionnaire' : 'to track value' }}
            accent={pipelineValueHasData}
          />
          <StatCard
            icon={<Trophy className="h-4 w-4" />}
            label="Deals Won"
            value={dealsWon.toLocaleString()}
            sub={{ bold: wonStageIds.size > 0 ? stages.find(s => s.is_won)?.name ?? 'Won stage' : 'No won stage', rest: '' }}
            deltaUp={dealsWon > 0}
          />
          <StatCard
            icon={<BarChart3 className="h-4 w-4" />}
            label="Deals in Progress"
            value={dealsInProgress.toLocaleString()}
            sub={{ bold: `${totalLeads > 0 ? Math.round((dealsInProgress / Math.max(totalLeads,1)) * 100) : 0}%`, rest: 'of pipeline' }}
            deltaUp={dealsInProgress > 0}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2.5 h-[38px] rounded-xl border border-border bg-card px-3 w-64">
            <Search className="h-[15px] w-[15px] text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search leads or company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center h-[38px] rounded-xl border border-border bg-card overflow-hidden">
            <button type="button"
              onClick={() => { setPipelineView('kanban'); try { localStorage.setItem('pipeline_view_mode', 'kanban') } catch {} }}
              className={cn(
                'flex h-full items-center gap-1.5 px-3.5 text-[13px] font-medium transition-colors',
                pipelineView === 'kanban'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}>
              <Columns3 className="h-3.5 w-3.5" /> Kanban
            </button>
            <div className="w-px h-full bg-border" />
            <button type="button"
              onClick={() => { setPipelineView('list'); try { localStorage.setItem('pipeline_view_mode', 'list') } catch {} }}
              className={cn(
                'flex h-full items-center gap-1.5 px-3.5 text-[13px] font-medium transition-colors',
                pipelineView === 'list'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}>
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>

          <div className="flex-1" />

          {/* Add Lead */}
          <Button asChild size="sm" className="h-[38px] rounded-xl px-4 text-[13px] gap-1.5">
            <Link href="/leads">
              <Plus className="h-3.5 w-3.5" /> Add Lead
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Kanban view ── */}
      {pipelineView === 'kanban' ? (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 px-6 pb-10 pt-1 items-start"
            style={{ minWidth: `${stages.length * 320 + 96}px` }}>
            {stages.map(stage => {
              const stageLeads = leadsByStage.get(stage.id) ?? []
              const isOver     = dragOverStage === stage.id

              return (
                <div key={stage.id} className="flex flex-col w-[300px] shrink-0 gap-3">

                  {/* Column header card */}
                  <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-card">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: stage.color }} />
                      <span className="text-[13.5px] font-semibold">{stage.name}</span>
                      {stage.is_won  && <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">WON</span>}
                      {stage.is_lost && <span className="rounded-md bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">LOST</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {stageLeads.length} {stageLeads.length === 1 ? 'lead' : 'leads'}
                    </span>
                  </div>

                  {/* Drop zone */}
                  <div
                    className={cn(
                      'flex flex-col gap-2.5 flex-1 min-h-[120px] rounded-2xl p-1 transition-colors',
                      isOver && 'bg-primary/5 ring-2 ring-primary/20 ring-inset',
                    )}
                    onDragOver={e => handleDragOver(e, stage.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, stage.id)}
                  >
                    <div className="flex flex-col gap-2.5 flex-1">
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
                      className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 mt-1 rounded-xl border border-dashed border-border/70 text-[13px] font-medium text-muted-foreground hover:border-border hover:text-foreground transition-all bg-background/50"
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
        /* ── List view ── */
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {stages.map((stage) => {
            const stageLeads = leadsByStage.get(stage.id) ?? []
            const isOver = dragOverStage === stage.id
            return (
              <div
                key={stage.id}
                className={cn('rounded-2xl border border-border bg-card shadow-card transition-colors', isOver && 'ring-2 ring-primary/25 bg-primary/5')}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
                    <p className="text-sm font-semibold">{stage.name}</p>
                    {stage.is_won  && <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">WON</span>}
                    {stage.is_lost && <span className="rounded-md bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">LOST</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{stageLeads.length} leads</span>
                </div>
                {stageLeads.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">No leads in this stage.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {stageLeads.map((lead) => {
                      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
                      const interestMeta = INTEREST_CONFIG[lead.interest_status as InterestStatus]
                      return (
                        <button
                          key={lead.id}
                          type="button"
                          draggable
                          onDragStart={(e) => handleDragStart(e, lead.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                              style={{ background: avatarColor(name), color: '#3a2a1d' }}
                            >
                              {name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold">{name}</p>
                              <p className="truncate text-xs text-muted-foreground">{lead.company ?? 'No company'} · {lead.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {interestMeta && (
                              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border', interestMeta.badge)}>
                                <span className={cn('h-1.5 w-1.5 rounded-full', interestMeta.dot)} />
                                {interestMeta.label}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {lead.last_contacted_at ? `Contacted ${timeAgo(lead.last_contacted_at)}` : `Added ${timeAgo(lead.created_at)}`}
                            </span>
                          </div>
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

// ── Kanban card ───────────────────────────────────────────────────────────────
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
  const dateIso      = lead.last_contacted_at ?? lead.created_at
  const dateLabel    = fmtDate(dateIso)
  const bg           = avatarColor(name)

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'rounded-xl border border-border bg-card shadow-card cursor-pointer select-none',
        'transition-all duration-150',
        isDragging ? 'opacity-40 scale-[0.97] shadow-none cursor-grabbing' : 'hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:border-border',
      )}
    >
      <div className="p-3.5 flex flex-col gap-2.5">

        {/* Title + ··· */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold leading-snug truncate">{name}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{lead.company ?? <span className="italic opacity-50">No company</span>}</p>
          </div>
          <button
            type="button"
            onClick={e => e.stopPropagation()}
            className="shrink-0 mt-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Phone + date */}
        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          {lead.phone ? (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              {lead.phone}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-muted-foreground/30 shrink-0" />
              <span className="opacity-40">—</span>
            </span>
          )}
          <span className="h-1 w-1 rounded-full bg-border shrink-0" />
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            {dateLabel}
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-border/60" />

        {/* Avatar + interest pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold border border-black/5"
              style={{ background: bg, color: '#3a2a1d' }}
            >
              {initials}
            </div>
            <span className="text-[12px] text-muted-foreground truncate">
              {lead.first_name ?? lead.email.split('@')[0]}
            </span>
          </div>

          {interestMeta ? (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border shrink-0',
              interestMeta.badge,
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', interestMeta.dot)} />
              {interestMeta.label}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border border-border bg-secondary text-muted-foreground shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              Pending
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, sub, deltaUp, accent,
}: {
  icon: React.ReactNode; label: string; value: string
  sub: { bold: string; rest: string }; deltaUp?: boolean; accent?: boolean
}) {
  return (
    <div className={cn(
      'rounded-2xl border bg-card p-5 shadow-card',
      accent ? 'border-emerald-200' : 'border-border',
    )}>
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className={accent ? 'text-emerald-600' : 'text-muted-foreground'}>{icon}</span>
        {label}
      </div>
      <div className="mt-3.5 flex items-end gap-3">
        <p className={cn(
          'text-[32px] font-bold leading-none tracking-[-0.02em]',
          accent ? 'text-emerald-700' : 'text-foreground',
        )}>
          {value}
        </p>
        {deltaUp !== undefined && (
          <span className={cn(
            'mb-0.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
            deltaUp
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-red-100 text-red-600',
          )}>
            {deltaUp ? '+' : ''}{ Number(value) > 0 ? value : '0' }
          </span>
        )}
      </div>
      <p className="mt-3.5 text-[12.5px] text-muted-foreground">
        <span className="font-semibold text-foreground">{sub.bold}</span>{' '}{sub.rest}
      </p>
    </div>
  )
}
