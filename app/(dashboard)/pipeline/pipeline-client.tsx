'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Settings, MoreHorizontal, GripVertical, User, Building2,
  X, Mail, Phone, Globe, ExternalLink, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)
  // track whether a drag just happened so card click doesn't open drawer
  const didDragRef = React.useRef(false)

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

  // ── Drawer lead patch (optimistic) ───────────────────────────────────
  function patchLead(leadId: string, patch: Partial<PipelineLead>) {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, ...patch } : l))
  }

  // ── Drag and drop ────────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, leadId: string) {
    didDragRef.current = true
    setDraggingId(leadId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverStage(null)
    // reset after a tick so the click handler (which fires after dragend) can check
    setTimeout(() => { didDragRef.current = false }, 0)
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
                        onOpen={() => {
                          if (!didDragRef.current) setSelectedLeadId(lead.id)
                        }}
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
      {/* ── Lead drawer ── */}
      {selectedLeadId && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setSelectedLeadId(null)}
          />
          <LeadDrawer
            leadId={selectedLeadId}
            onClose={() => setSelectedLeadId(null)}
            onLeadChange={(patch) => patchLead(selectedLeadId, patch)}
          />
        </>
      )}
    </div>
  )
}

// ── Lead card ─────────────────────────────────────────────────────────────
function LeadCard({
  lead,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  lead:         PipelineLead
  isDragging:   boolean
  onDragStart:  (e: React.DragEvent, id: string) => void
  onDragEnd:    () => void
  onOpen:       () => void
}) {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  const interestMeta = INTEREST_CONFIG[lead.interest_status as InterestStatus]

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'group relative rounded-xl border bg-background p-3 cursor-pointer transition-all duration-150',
        isDragging
          ? 'opacity-50 scale-95 border-primary/50 shadow-none cursor-grabbing'
          : 'border-border hover:border-primary/30 hover:shadow-sm'
      )}
    >
      {/* Drag handle */}
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-40 transition-opacity">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* Lead name */}
      <p className="font-medium text-sm text-foreground leading-tight mb-1 pr-5 truncate">
        {name}
      </p>

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
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap',
          interestMeta.badge
        )}>
          {interestMeta.icon} {interestMeta.label}
        </span>
      </div>
    </div>
  )
}

// ── Lead drawer ────────────────────────────────────────────────────────────
interface FullLead {
  id:              string
  first_name:      string | null
  last_name:       string | null
  email:           string
  phone:           string | null
  company:         string | null
  title:           string | null
  website:         string | null
  status:          LeadStatus
  interest_status: InterestStatus
}

function LeadDrawer({
  leadId,
  onClose,
  onLeadChange,
}: {
  leadId:        string
  onClose:       () => void
  onLeadChange:  (patch: Partial<PipelineLead>) => void
}) {
  const [lead, setLead]       = React.useState<FullLead | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    setLoading(true)
    setLead(null)
    fetch(`/api/leads/${leadId}`)
      .then((r) => r.json())
      .then((d) => setLead(d.lead ?? null))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [leadId])

  async function changeStatus(status: LeadStatus) {
    if (!lead) return
    setLead((l) => l ? { ...l, status } : l)
    onLeadChange({ status })
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(console.error)
  }

  async function changeInterest(interest_status: InterestStatus) {
    if (!lead) return
    setLead((l) => l ? { ...l, interest_status } : l)
    onLeadChange({ interest_status })
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest_status }),
    }).catch(console.error)
  }

  const name = lead
    ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
    : '…'

  const statusMeta   = lead ? STATUS_CONFIG[lead.status] : null
  const interestMeta = lead ? INTEREST_CONFIG[lead.interest_status] : null

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="font-semibold leading-tight truncate">{name}</p>
          {lead?.company && (
            <p className="mt-0.5 text-sm text-muted-foreground truncate">{lead.company}</p>
          )}
          {lead?.title && !lead.company && (
            <p className="mt-0.5 text-sm text-muted-foreground truncate">{lead.title}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/leads/${leadId}`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="View full profile"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      )}

      {!loading && lead && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Status + Interest badges */}
          <div className="flex flex-wrap gap-2">
            {/* Status dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity',
                    statusMeta?.badge
                  )}
                >
                  {statusMeta?.label}
                  <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" minWidth="170px">
                <DropdownMenuLabel>Change status</DropdownMenuLabel>
                {ALL_STATUSES.map((s) => {
                  const m = STATUS_CONFIG[s]
                  return (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => changeStatus(s)}
                      className={cn(s === lead.status && 'opacity-50 cursor-default')}
                    >
                      <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />
                      {m.label}
                      {s === lead.status && (
                        <span className="ml-auto text-xs text-muted-foreground">current</span>
                      )}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Interest dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity',
                    interestMeta?.badge
                  )}
                >
                  {interestMeta?.label}
                  <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" minWidth="160px">
                <DropdownMenuLabel>Interest level</DropdownMenuLabel>
                {ALL_INTEREST_STATUSES.map((s) => {
                  const m = INTEREST_CONFIG[s]
                  return (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => changeInterest(s)}
                      className={cn(s === lead.interest_status && 'opacity-50 cursor-default')}
                    >
                      <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />
                      {m.label}
                      {s === lead.interest_status && (
                        <span className="ml-auto text-xs text-muted-foreground">current</span>
                      )}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Contact info */}
          <div className="space-y-3">
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-2.5 text-sm text-primary hover:underline"
            >
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{lead.email}</span>
            </a>

            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="flex items-center gap-2.5 text-sm hover:underline"
              >
                <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {lead.phone}
              </a>
            )}

            {lead.website && (
              <a
                href={lead.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-sm text-primary hover:underline"
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
          </div>

          {/* Full profile link */}
          <div className="pt-2 border-t border-border">
            <Link
              href={`/leads/${leadId}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              View full profile
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
