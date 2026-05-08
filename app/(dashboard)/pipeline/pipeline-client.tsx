'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Settings, MoreHorizontal, GripVertical, User, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { INTEREST_CONFIG } from '@/components/leads/status-config'
import type { InterestStatus } from '@/types/database'

// ── Types ─────────────────────────────────────────────────────────────────
interface PipelineStage {
  id:         string
  name:       string
  color:      string
  position:   number
  is_won:     boolean
  is_lost:    boolean
  workspace_id: string
  created_at: string
  updated_at: string
}

interface PipelineLead {
  id:               string
  first_name:       string | null
  last_name:        string | null
  email:            string
  company:          string | null
  title:            string | null
  phone:            string | null
  status:           string
  interest_status:  InterestStatus
  pipeline_stage_id: string | null
  assigned_to:      string | null
  batch_id:         string | null
  created_at:       string
  updated_at:       string
}

interface Props {
  stages:       PipelineStage[]
  initialLeads: PipelineLead[]
  workspaceId:  string
  isAdmin:      boolean
}

// ── Component ─────────────────────────────────────────────────────────────
export default function PipelineClient({ stages, initialLeads, isAdmin }: Props) {
  const router = useRouter()
  const [leads, setLeads] = React.useState<PipelineLead[]>(initialLeads)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')

  // Sync with server component data after router.refresh()
  React.useEffect(() => {
    setLeads(initialLeads)
  }, [initialLeads])

  // Refresh server data on every mount (navigating to this page always gets fresh leads)
  React.useEffect(() => {
    router.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Group leads by stage — unassigned go into first stage
  const leadsByStage = React.useMemo(() => {
    const filtered = search
      ? leads.filter((l) => {
          const q = search.toLowerCase()
          return [l.first_name, l.last_name, l.email, l.company]
            .filter(Boolean).join(' ').toLowerCase().includes(q)
        })
      : leads

    const map = new Map<string | null, PipelineLead[]>()
    for (const stage of stages) map.set(stage.id, [])
    map.set(null, []) // unassigned

    for (const lead of filtered) {
      const stageId = lead.pipeline_stage_id
      if (stageId && map.has(stageId)) {
        map.get(stageId)!.push(lead)
      } else {
        map.get(null)!.push(lead)
      }
    }
    return map
  }, [leads, stages, search])

  // Total deal count per stage
  function stageCount(stageId: string) {
    return leadsByStage.get(stageId)?.length ?? 0
  }

  // ── Drag and drop ────────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, leadId: string) {
    setDraggingId(leadId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverStage(null)
  }

  function handleDragOver(e: React.DragEvent, stageId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stageId)
  }

  function handleDragLeave() {
    setDragOverStage(null)
  }

  async function handleDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault()
    setDragOverStage(null)
    if (!draggingId) return

    const lead = leads.find((l) => l.id === draggingId)
    if (!lead || lead.pipeline_stage_id === stageId) return

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) =>
        l.id === draggingId ? { ...l, pipeline_stage_id: stageId } : l
      )
    )
    setDraggingId(null)

    try {
      await fetch(`/api/leads/${draggingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage_id: stageId }),
      })
      router.refresh() // bust leads page cache so pipeline_stage_id syncs
    } catch (err) {
      console.error('Failed to update pipeline stage:', err)
      setLeads((prev) =>
        prev.map((l) =>
          l.id === draggingId ? { ...l, pipeline_stage_id: lead.pipeline_stage_id } : l
        )
      )
    }
  }

  const totalLeads = leads.length
  const unassigned = leadsByStage.get(null)?.length ?? 0

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalLeads} leads total{unassigned > 0 && ` · ${unassigned} unassigned`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 rounded-lg border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Manage Stages</span>
            </Button>
          )}
          <Button size="sm" asChild className="gap-1.5">
            <Link href="/leads">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Lead</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 min-h-full" style={{ minWidth: `${stages.length * 280 + 48}px` }}>
          {stages.map((stage) => {
            const stageLeads = leadsByStage.get(stage.id) ?? []
            const isOver = dragOverStage === stage.id

            return (
              <div
                key={stage.id}
                className={cn(
                  'flex flex-col w-[260px] shrink-0 rounded-2xl border transition-all duration-200',
                  isOver
                    ? 'border-primary/50 bg-primary/5 shadow-lg'
                    : 'border-border bg-card'
                )}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                {/* Stage header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm font-semibold truncate">{stage.name}</span>
                    {(stage.is_won || stage.is_lost) && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] px-1.5 py-0',
                          stage.is_won  ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400' : '',
                          stage.is_lost ? 'border-red-400 text-red-600 dark:text-red-400' : ''
                        )}
                      >
                        {stage.is_won ? 'WON' : 'LOST'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {stageCount(stage.id)}
                    </span>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Lead cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-200px)]">
                  {stageLeads.length === 0 ? (
                    <div
                      className={cn(
                        'flex items-center justify-center h-24 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition-colors',
                        isOver ? 'border-primary/50 text-primary' : 'border-border'
                      )}
                    >
                      {isOver ? 'Drop here' : 'No leads'}
                    </div>
                  ) : (
                    stageLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        isDragging={draggingId === lead.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    ))
                  )}
                </div>

                {/* Add lead to stage shortcut */}
                <div className="p-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                    asChild
                  >
                    <Link href={`/leads?pipeline_stage=${stage.id}`}>
                      <Plus className="h-3 w-3" />
                      Add lead
                    </Link>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Lead card ─────────────────────────────────────────────────────────────
function LeadCard({
  lead,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  lead:         PipelineLead
  isDragging:   boolean
  onDragStart:  (e: React.DragEvent, id: string) => void
  onDragEnd:    () => void
}) {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  const interestMeta = INTEREST_CONFIG[lead.interest_status as InterestStatus]

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative rounded-xl border bg-background p-3 cursor-grab active:cursor-grabbing transition-all duration-150',
        isDragging
          ? 'opacity-50 scale-95 border-primary/50 shadow-none'
          : 'border-border hover:border-primary/30 hover:shadow-sm'
      )}
    >
      {/* Drag handle */}
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-40 transition-opacity">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* Lead name + link */}
      <Link
        href={`/leads/${lead.id}`}
        onClick={(e) => e.stopPropagation()}
        className="block font-medium text-sm text-foreground hover:text-primary transition-colors leading-tight mb-1 pr-5 truncate"
      >
        {name}
      </Link>

      {/* Company */}
      {lead.company && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <Building2 className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{lead.company}</span>
        </div>
      )}

      {/* Title */}
      {lead.title && !lead.company && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <User className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{lead.title}</span>
        </div>
      )}

      {/* Interest badge */}
      <div className="flex items-center justify-between mt-2">
        <span className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border',
          interestMeta.badge
        )}>
          {interestMeta.icon} {interestMeta.label}
        </span>
      </div>
    </div>
  )
}
