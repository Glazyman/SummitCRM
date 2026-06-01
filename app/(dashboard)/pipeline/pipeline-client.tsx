'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Columns3, List,
  MoreHorizontal, TrendingUp, Calendar, Phone,
  BarChart3, Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
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
  last_activity_at:  string | null
  /** Parsed revenue from questionnaire (0 if not filled) */
  pipeline_value: number
}
interface PipelineTotals {
  total_leads:       number
  hot_leads:         number
  deals_won:         number
  deals_in_progress: number
}
interface Props {
  stages: PipelineStage[]; initialLeads: PipelineLead[]
  initialStageCounts: Record<string, number>
  initialTotals:      PipelineTotals
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

export default function PipelineClient({ stages, initialLeads, initialStageCounts, initialTotals, isAdmin, currentUserId }: Props) {
  const router = useRouter()
  const [leads,          setLeads]          = React.useState<PipelineLead[]>(initialLeads)
  const [stageCounts,    setStageCounts]    = React.useState<Record<string, number>>(initialStageCounts)
  const [totals,         setTotals]         = React.useState<PipelineTotals>(initialTotals)
  const [draggingId,     setDraggingId]     = React.useState<string | null>(null)
  const [dragOverStage,  setDragOverStage]  = React.useState<string | null>(null)
  const [search,         setSearch]         = React.useState('')
  const [searching,      setSearching]      = React.useState(false)
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)
  const [pipelineView,   setPipelineView]   = React.useState<'kanban' | 'list'>(() => {
    try { return localStorage.getItem('pipeline_view_mode') === 'list' ? 'list' : 'kanban' } catch { return 'kanban' }
  })
  // The kanban board is 1500px+ wide (one 300px column per stage), so on
  // phones/tablets force the list view. Desktop (≥ lg) keeps the saved choice.
  const isMobile = useIsMobile()
  const effectivePipelineView = isMobile ? 'list' : pipelineView
  const didDragRef = React.useRef(false)

  // When router.refresh() runs (after a mutation), the server component
  // re-renders and passes new initialLeads/counts/totals. Reset state to
  // match — overflow-loaded leads are lost, which is acceptable (rare).
  React.useEffect(() => { setLeads(initialLeads) }, [initialLeads])
  React.useEffect(() => { setStageCounts(initialStageCounts) }, [initialStageCounts])
  React.useEffect(() => { setTotals(initialTotals) }, [initialTotals])

  // Debounced server-side search. Empty query = restore initial state.
  React.useEffect(() => {
    const q = search.trim()
    if (q.length === 0) {
      // Restore initial server snapshot
      setLeads(initialLeads)
      setStageCounts(initialStageCounts)
      setTotals(initialTotals)
      setSearching(false)
      return
    }
    setSearching(true)
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/pipeline/search?q=${encodeURIComponent(q)}`)
        const json = await res.json() as {
          leads: PipelineLead[]
          counts: Record<string, number>
          totals: PipelineTotals
        }
        setLeads(json.leads ?? [])
        setStageCounts(json.counts ?? {})
        setTotals(json.totals ?? initialTotals)
      } catch (err) {
        console.error('Pipeline search failed', err)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => window.clearTimeout(handle)
  }, [search, initialLeads, initialStageCounts, initialTotals])

  const leadsByStage = React.useMemo(() => {
    const map = new Map<string | null, PipelineLead[]>()
    for (const s of stages) map.set(s.id, [])
    map.set(null, [])
    for (const lead of leads) {
      const sid = lead.pipeline_stage_id
      if (sid && map.has(sid)) map.get(sid)!.push(lead)
      else map.get(null)!.push(lead)
    }
    return map
  }, [leads, stages])

  // Load the next 100 leads for a stage when "+N more" is clicked.
  async function loadStageOverflow(stageId: string) {
    const visible = leadsByStage.get(stageId)?.length ?? 0
    try {
      const res = await fetch(`/api/pipeline/stage-overflow?stage_id=${stageId}&offset=${visible}`)
      const json = await res.json() as { leads: PipelineLead[] }
      const more = json.leads ?? []
      if (more.length === 0) return
      // Merge into leads, de-duping by id in case of overlap
      setLeads((prev) => {
        const seen = new Set(prev.map((l) => l.id))
        return [...prev, ...more.filter((l) => !seen.has(l.id))]
      })
    } catch (err) {
      console.error('Pipeline stage overflow failed', err)
    }
  }

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

  // Move a lead between pipeline stages (used by drag-drop and the
  // 3-dot menu on each card).
  async function moveLeadToStage(leadId: string, sid: string) {
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.pipeline_stage_id === sid) return
    setLeads(p => p.map(l => l.id === leadId ? { ...l, pipeline_stage_id: sid } : l))
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage_id: sid }),
      })
      router.refresh()
    } catch {
      // Roll back optimistic update
      setLeads(p => p.map(l => l.id === leadId ? { ...l, pipeline_stage_id: lead.pipeline_stage_id } : l))
    }
  }

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

  // All four numbers come from the server (accurate across the full
  // workspace, not just the trimmed top-100-per-stage visible set).
  const totalLeads      = totals.total_leads
  const hotLeads        = totals.hot_leads
  const dealsWon        = totals.deals_won
  const dealsInProgress = totals.deals_in_progress
  const unassigned      = stageCounts['__unassigned__'] ?? 0

  const wonStageIds = new Set(stages.filter(s => s.is_won).map(s => s.id))

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'hsl(var(--background))' }}>

      {/* ── Page title + toolbar ── */}
      <div className="px-4 sm:px-6 pt-6 pb-4 space-y-5">
        <h1 className="text-2xl font-bold tracking-[-0.025em]">Sales Pipeline</h1>

        {/* Toolbar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2.5 h-[38px] rounded-xl border border-border bg-card px-3 w-full sm:w-64">
            <Search className="h-[15px] w-[15px] text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search leads or company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
            />
            {searching && (
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            )}
          </div>

          {/* View toggle — desktop only; mobile is always the list view */}
          <div className="hidden lg:flex items-center gap-1.5">
            <Button
              size="sm"
              variant={pipelineView === 'kanban' ? 'default' : 'outline'}
              className="gap-1.5"
              onClick={() => { setPipelineView('kanban'); try { localStorage.setItem('pipeline_view_mode', 'kanban') } catch {} }}
            >
              <Columns3 className="h-3.5 w-3.5" /> Kanban
            </Button>
            <Button
              size="sm"
              variant={pipelineView === 'list' ? 'default' : 'outline'}
              className="gap-1.5"
              onClick={() => { setPipelineView('list'); try { localStorage.setItem('pipeline_view_mode', 'list') } catch {} }}
            >
              <List className="h-3.5 w-3.5" /> List
            </Button>
          </div>

          <div className="flex-1" />

          {/* Add Lead */}
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/leads">
              <Plus className="h-3.5 w-3.5" /> Add Lead
            </Link>
          </Button>
        </div>

        {/* Stat cards — below toolbar */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Total Deals"
            value={totalLeads.toLocaleString()}
            sub={{ bold: `${stages.length} stages`, rest: `· ${unassigned} unassigned` }}
          />
          <StatCard
            icon={<Trophy className="h-4 w-4" />}
            label="Hot Leads"
            value={hotLeads.toLocaleString()}
            sub={{ bold: `${totalLeads > 0 ? Math.round((hotLeads / Math.max(totalLeads, 1)) * 100) : 0}%`, rest: 'marked interested' }}
            deltaUp={hotLeads > 0}
            accent={hotLeads > 0}
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
      </div>

      {/* ── Kanban view ── */}
      {effectivePipelineView === 'kanban' ? (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 px-6 pb-10 pt-1 items-start"
            style={{ minWidth: `${stages.length * 320 + 96}px` }}>
            {stages.map(stage => {
              const stageLeads = leadsByStage.get(stage.id) ?? []
              const stageTotal = stageCounts[stage.id] ?? stageLeads.length
              const hasMore    = stageTotal > stageLeads.length
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
                      {stageTotal} {stageTotal === 1 ? 'lead' : 'leads'}
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
                          stages={stages}
                          isDragging={draggingId === lead.id}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onOpen={() => { if (!didDragRef.current) setSelectedLeadId(lead.id) }}
                          onMoveToStage={moveLeadToStage}
                        />
                      ))}
                    </div>

                    {/* Load more */}
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => loadStageOverflow(stage.id)}
                        className="w-full px-3 py-2 mt-1 rounded-xl border border-border/70 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                      >
                        + {stageTotal - stageLeads.length} more
                      </button>
                    )}

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
            const stageTotal = stageCounts[stage.id] ?? stageLeads.length
            const hasMore    = stageTotal > stageLeads.length
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
                  <span className="text-xs text-muted-foreground">{stageTotal} leads</span>
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
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => loadStageOverflow(stage.id)}
                    className="w-full px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors border-t border-border"
                  >
                    + {stageTotal - stageLeads.length} more
                  </button>
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
            onLeadChange={patch => patchLead(selectedLeadId, patch as unknown as Partial<PipelineLead>)}
          />
        </>
      )}
    </div>
  )
}

// ── Kanban card ───────────────────────────────────────────────────────────────
function KanbanCard({
  lead, stageColor, stages, isDragging, onDragStart, onDragEnd, onOpen, onMoveToStage,
}: {
  lead: PipelineLead; stageColor: string; stages: PipelineStage[]; isDragging: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void; onOpen: () => void
  onMoveToStage: (leadId: string, stageId: string) => void
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={e => e.stopPropagation()}
                className="shrink-0 mt-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                aria-label="Card actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" minWidth="190px">
              <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
              {stages.map(s => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (s.id !== lead.pipeline_stage_id) onMoveToStage(lead.id, s.id)
                  }}
                  className={cn(s.id === lead.pipeline_stage_id && 'opacity-50 cursor-default')}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.name}
                  {s.id === lead.pipeline_stage_id && (
                    <span className="ml-auto text-xs text-muted-foreground">current</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
