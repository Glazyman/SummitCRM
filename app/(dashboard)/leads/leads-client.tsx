'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Upload, UserPlus, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import { LeadStatusBar }        from '@/components/leads/lead-status-bar'
import { LeadFullPanel }        from '@/components/leads/lead-full-panel'
import { LeadFiltersPanel }     from '@/components/leads/lead-filters'
import { LeadTable }            from '@/components/leads/lead-table'
import { BulkActionBar }        from '@/components/leads/bulk-action-bar'
import { ColumnVisibilityMenu } from '@/components/leads/column-visibility-menu'
import { CreateLeadModal }      from '@/components/leads/create-lead-modal'

import { COLUMNS, DEFAULT_FILTERS, DEFAULT_COLUMN_ORDER } from '@/components/leads/types'
import type { LeadRow, LeadFilters, LeadStatus, InterestStatus, ColumnId, SortField, StatusCount } from '@/components/leads/types'
import type { NewLeadData } from '@/components/leads/create-lead-modal'

// ── Types ──────────────────────────────────────────────────────────────────
interface LeadsClientProps {
  initialLeads:  LeadRow[]
  batches:       { id: string; name: string }[]
  teamMembers:   { id: string; name: string }[]
  isAdmin:       boolean
  currentUserId: string
  role?:         string
}

const PER_PAGE = 50

// ── Sorting helper ─────────────────────────────────────────────────────────
function sortLeads(leads: LeadRow[], by: SortField, dir: 'asc' | 'desc'): LeadRow[] {
  return [...leads].sort((a, b) => {
    let av: string | null, bv: string | null

    switch (by) {
      case 'name':
        av = [a.first_name, a.last_name].filter(Boolean).join(' ')
        bv = [b.first_name, b.last_name].filter(Boolean).join(' ')
        break
      case 'email':            av = a.email;            bv = b.email;            break
      case 'company':          av = a.company;          bv = b.company;          break
      case 'status':           av = a.status;           bv = b.status;           break
      case 'last_activity_at': av = a.last_activity_at; bv = b.last_activity_at; break
      case 'created_at':
      default:                 av = a.created_at;       bv = b.created_at;       break
    }

    if (!av && !bv) return 0
    if (!av) return 1
    if (!bv) return -1
    const cmp = av.localeCompare(bv)
    return dir === 'asc' ? cmp : -cmp
  })
}

// ── Filter helper ──────────────────────────────────────────────────────────
function applyFilters(leads: LeadRow[], filters: LeadFilters, currentUserId: string): LeadRow[] {
  return leads.filter((lead) => {
    // My leads
    if (filters.myLeads && lead.assigned_to !== currentUserId) return false

    // Status multi-filter
    if (filters.statuses.length > 0 && !filters.statuses.includes(lead.status)) return false

    // Batch
    if (filters.batchId && lead.batch_id !== filters.batchId) return false

    // Assigned to
    if (filters.assignedTo === 'unassigned' && lead.assigned_to) return false
    if (filters.assignedTo && filters.assignedTo !== 'unassigned' && lead.assigned_to !== filters.assignedTo) return false

    // Date range
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime()
      if (new Date(lead.created_at).getTime() < from) return false
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo).getTime() + 86400000 // inclusive end
      if (new Date(lead.created_at).getTime() > to) return false
    }

    // Full-text search
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const hay = [
        lead.first_name, lead.last_name, lead.email,
        lead.company, lead.title,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }

    return true
  })
}

// ── Component ──────────────────────────────────────────────────────────────
export function LeadsClient({
  initialLeads,
  batches,
  teamMembers,
  isAdmin,
  currentUserId,
  role,
}: LeadsClientProps) {
  const isRep = role === 'rep'
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // ── Build initial filters from URL params ────────────────────────────
  const filtersFromUrl = React.useMemo((): LeadFilters => {
    const p = searchParams
    return {
      search:     p.get('q')          ?? '',
      statuses:   (p.get('status')?.split(',').filter(Boolean) ?? []) as LeadStatus[],
      batchId:    p.get('batch')      ?? null,
      assignedTo: p.get('assigned')   ?? null,
      myLeads:    p.get('my') === '1',
      dateFrom:   p.get('from')       ?? '',
      dateTo:     p.get('to')         ?? '',
      sortBy:     (p.get('sort')      ?? 'created_at') as LeadFilters['sortBy'],
      sortDir:    (p.get('dir')       ?? 'desc') as 'asc' | 'desc',
      page:       parseInt(p.get('page') ?? '1', 10),
      perPage:    PER_PAGE,
    }
  }, [searchParams])

  // ── State ──────────────────────────────────────────────────────────────
  const [filters, setFilters]           = React.useState<LeadFilters>(filtersFromUrl)
  const [leads, setLeads]               = React.useState<LeadRow[]>(initialLeads)
  const [selectedIds, setSelectedIds]   = React.useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen]     = React.useState(false)
  const [visibleColumns, setVisibleCols] = React.useState<Set<ColumnId>>(() => {
    try {
      const saved = localStorage.getItem('leads_column_config')
      if (saved) {
        const { visible } = JSON.parse(saved) as { visible: ColumnId[] }
        if (Array.isArray(visible)) return new Set(visible as ColumnId[])
      }
    } catch { /* ignore */ }
    const defaults = new Set(COLUMNS.filter((c) => c.defaultOn).map((c) => c.id))
    if (isRep) { defaults.add('phone'); defaults.delete('assigned') }
    return defaults
  })
  const [columnOrder, setColumnOrder] = React.useState<ColumnId[]>(() => {
    try {
      const saved = localStorage.getItem('leads_column_config')
      if (saved) {
        const { order } = JSON.parse(saved) as { order: ColumnId[] }
        if (Array.isArray(order)) {
          const allIds = new Set(DEFAULT_COLUMN_ORDER)
          const savedIds = new Set(order)
          if (DEFAULT_COLUMN_ORDER.every(id => savedIds.has(id)) && order.every(id => allIds.has(id))) {
            return order
          }
        }
      }
    } catch { /* ignore */ }
    return DEFAULT_COLUMN_ORDER
  })
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)
  // Derive the panel lead live from state so status/interest changes reflect instantly
  const selectedLead = selectedLeadId ? (leads.find((l) => l.id === selectedLeadId) ?? null) : null

  // ── Keep in sync with server ───────────────────────────────────────────
  // When router.refresh() re-runs the server component, initialLeads gets a
  // new reference → sync local state so changes from the detail page show up.
  React.useEffect(() => {
    setLeads(initialLeads)
  }, [initialLeads])

  // On every mount (including after navigating back from lead detail),
  // ask Next.js to re-run the server component so we always get fresh data.
  React.useEffect(() => {
    router.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derive displayed leads ────────────────────────────────────────────
  const filtered = React.useMemo(
    () => applyFilters(leads, filters, currentUserId),
    [leads, filters, currentUserId]
  )
  const sorted = React.useMemo(
    () => sortLeads(filtered, filters.sortBy, filters.sortDir),
    [filtered, filters.sortBy, filters.sortDir]
  )
  const totalCount  = sorted.length
  const pageLeads   = sorted.slice((filters.page - 1) * PER_PAGE, filters.page * PER_PAGE)
  const totalPages  = Math.max(1, Math.ceil(totalCount / PER_PAGE))

  // ── Status counts (for status bar) ───────────────────────────────────
  const statusCounts: StatusCount[] = React.useMemo(() => {
    const map = new Map<LeadStatus, number>()
    // Count from non-status-filtered leads (so bar shows correct totals)
    const baseLeads = applyFilters(leads, { ...filters, statuses: [] }, currentUserId)
    for (const l of baseLeads) {
      map.set(l.status, (map.get(l.status) ?? 0) + 1)
    }
    return [...map.entries()].map(([status, count]) => ({ status, count }))
  }, [leads, filters, currentUserId])

  // ── URL sync ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    const params = new URLSearchParams()
    if (filters.search)              params.set('q',        filters.search)
    if (filters.statuses.length > 0) params.set('status',   filters.statuses.join(','))
    if (filters.batchId)             params.set('batch',    filters.batchId)
    if (filters.assignedTo)          params.set('assigned', filters.assignedTo)
    if (filters.myLeads)             params.set('my',       '1')
    if (filters.dateFrom)            params.set('from',     filters.dateFrom)
    if (filters.dateTo)              params.set('to',       filters.dateTo)
    if (filters.sortBy !== 'created_at') params.set('sort', filters.sortBy)
    if (filters.sortDir !== 'desc')      params.set('dir',  filters.sortDir)
    if (filters.page > 1)            params.set('page',     String(filters.page))

    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [filters, pathname, router])

  // ── Handlers ──────────────────────────────────────────────────────────
  function updateFilters(patch: Partial<LeadFilters>) {
    setFilters((f) => ({ ...f, ...patch }))
    setSelectedIds(new Set())
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
    setSelectedIds(new Set())
  }

  function handleSort(field: SortField) {
    setFilters((f) => ({
      ...f,
      sortBy:  field,
      sortDir: f.sortBy === field && f.sortDir === 'asc' ? 'desc' : 'asc',
      page:    1,
    }))
  }

  function handleStatusFilter(status: LeadStatus) {
    setFilters((f) => {
      const next = f.statuses.includes(status)
        ? f.statuses.filter((s) => s !== status)
        : [...f.statuses, status]
      return { ...f, statuses: next, page: 1 }
    })
  }

  function handleSelectAll() {
    if (pageLeads.every((l) => selectedIds.has(l.id))) {
      setSelectedIds((s) => {
        const next = new Set(s)
        pageLeads.forEach((l) => next.delete(l.id))
        return next
      })
    } else {
      setSelectedIds((s) => {
        const next = new Set(s)
        pageLeads.forEach((l) => next.add(l.id))
        return next
      })
    }
  }

  function handleSelectRow(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Inline status change (optimistic + API) ──────────────────────────
  function handleStatusChange(leadId: string, status: LeadStatus) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status, updated_at: new Date().toISOString() } : l))
    )
    fetch(`/api/leads/${leadId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    }).catch(console.error)
  }

  // ── Inline interest change (optimistic + API) ─────────────────────────
  function handleInterestChange(leadId: string, interest_status: InterestStatus) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, interest_status, updated_at: new Date().toISOString() } : l))
    )
    fetch(`/api/leads/${leadId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ interest_status }),
    }).catch(console.error)
  }

  // ── Bulk actions ───────────────────────────────────────────────────────
  function handleBulkStatus(status: LeadStatus) {
    const ids = [...selectedIds]
    setLeads((prev) =>
      prev.map((l) => ids.includes(l.id) ? { ...l, status, updated_at: new Date().toISOString() } : l)
    )
    setSelectedIds(new Set())
    fetch('/api/leads/bulk', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids, status }),
    }).catch(console.error)
  }

  function handleBulkAssign(userId: string) {
    const ids    = [...selectedIds]
    const member = teamMembers.find((m) => m.id === userId)
    setLeads((prev) =>
      prev.map((l) => ids.includes(l.id)
        ? { ...l, assigned_to: userId || null, assigned_name: member?.name ?? null, updated_at: new Date().toISOString() }
        : l
      )
    )
    setSelectedIds(new Set())
    fetch('/api/leads/bulk', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids, assigned_to: userId || null }),
    }).catch(console.error)
  }

  function handleBulkBatch(batchId: string) {
    const ids   = [...selectedIds]
    const batch = batches.find((b) => b.id === batchId)
    setLeads((prev) =>
      prev.map((l) => ids.includes(l.id)
        ? { ...l, batch_id: batchId, batch_name: batch?.name ?? null, updated_at: new Date().toISOString() }
        : l
      )
    )
    setSelectedIds(new Set())
    fetch('/api/leads/bulk', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids, batch_id: batchId }),
    }).catch(console.error)
  }

  function handleBulkDelete() {
    const ids = [...selectedIds]
    setLeads((prev) => prev.filter((l) => !ids.includes(l.id)))
    setSelectedIds(new Set())
    fetch('/api/leads/bulk', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids }),
    }).catch(console.error)
  }

  async function handleDeleteLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id))
    setSelectedIds((s) => { const next = new Set(s); next.delete(id); return next })
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error('Delete failed:', json.error ?? res.status)
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
    router.refresh()
  }

  async function handleCreateLead(data: NewLeadData) {
    try {
      const res = await fetch('/api/leads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create lead')

      const lead = json.lead
      const newLead: LeadRow = {
        id:               lead.id,
        workspace_id:     lead.workspace_id,
        first_name:       lead.first_name ?? null,
        last_name:        lead.last_name  ?? null,
        email:            lead.email,
        phone:            lead.phone      ?? null,
        company:          lead.company    ?? null,
        title:            lead.title      ?? null,
        website:          lead.website    ?? null,
        linkedin_url:     lead.linkedin_url ?? null,
        status:           lead.status,
        interest_status:  lead.interest_status ?? 'pending',
        pipeline_stage_id: null,
        batch_id:         lead.batch_id   ?? null,
        batch_name:       batches.find((b) => b.id === lead.batch_id)?.name ?? null,
        assigned_to:      lead.assigned_to ?? null,
        assigned_name:    teamMembers.find((m) => m.id === lead.assigned_to)?.name ?? null,
        last_activity_at: null,
        tags:             [],
        custom_fields:    lead.custom_fields ?? {},
        created_at:       lead.created_at,
        updated_at:       lead.updated_at,
      }
      setLeads((prev) => [newLead, ...prev])
    } catch (err) {
      console.error('Create lead failed:', err)
    }
  }

  function handleToggleColumn(id: ColumnId) {
    setVisibleCols((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleReorderColumns(order: ColumnId[]) {
    setColumnOrder(order) // preview only — not saved until Save is clicked
  }

  function handleSaveColumns(order: ColumnId[], visible: Set<ColumnId>) {
    setColumnOrder(order)
    setVisibleCols(new Set(visible))
    try {
      localStorage.setItem('leads_column_config', JSON.stringify({
        order,
        visible: [...visible],
      }))
    } catch { /* ignore */ }
  }

  function handleExport() {
    const headers = ['Name', 'Email', 'Company', 'Title', 'Status', 'Batch', 'Assigned To', 'Created At']
    const rows    = filtered.map((l) => [
      [l.first_name, l.last_name].filter(Boolean).join(' '),
      l.email, l.company ?? '', l.title ?? '', l.status,
      l.batch_name ?? '', l.assigned_name ?? '',
      new Date(l.created_at).toLocaleDateString(),
    ])
    const csv  = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-24">

      {/* ── Page header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isRep ? 'My Leads' : 'Leads'}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {totalCount.toLocaleString()} lead{totalCount !== 1 ? 's' : ''}
            {filters.batchId && batches.find(b => b.id === filters.batchId) && ` · ${batches.find(b => b.id === filters.batchId)!.name}`}
            {(filters.search || filters.statuses.length > 0) && ' matching filters'}
          </p>
        </div>

        {!isRep && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/leads/import">
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1.5">Import</span>
              </Link>
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Lead</span>
            </Button>
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <LeadStatusBar
        counts={statusCounts}
        totalCount={applyFilters(leads, { ...filters, statuses: [] }, currentUserId).length}
        activeStatuses={filters.statuses}
        onStatusClick={handleStatusFilter}
      />

      {/* ── Filters ── */}
      <LeadFiltersPanel
        filters={filters}
        batches={batches}
        teamMembers={teamMembers}
        isAdmin={isAdmin}
        isRep={isRep}
        onChange={updateFilters}
        onClear={clearFilters}
      />

      {/* ── Toolbar: results count + column visibility ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {selectedIds.size > 0 ? (
            <span className="font-medium text-foreground">
              {selectedIds.size} selected
            </span>
          ) : (
            <span>
              Showing {pageLeads.length.toLocaleString()} of {totalCount.toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ColumnVisibilityMenu
            visibleColumns={visibleColumns}
            columnOrder={columnOrder}
            onToggle={handleToggleColumn}
            onReorder={handleReorderColumns}
            onSave={handleSaveColumns}
          />
        </div>
      </div>

      {/* ── Lead table ── */}
      <LeadTable
        leads={pageLeads}
        selectedIds={selectedIds}
        sortBy={filters.sortBy}
        sortDir={filters.sortDir}
        visibleColumns={visibleColumns}
        columnOrder={columnOrder}
        isAdmin={isAdmin}
        onSelectAll={handleSelectAll}
        onSelectRow={handleSelectRow}
        onSort={handleSort}
        onStatusChange={handleStatusChange}
        onInterestChange={handleInterestChange}
        onRowClick={(lead) => setSelectedLeadId(lead.id)}
        onSendEmail={(lead) => console.log('send email to', lead.email)}
        onDeleteLead={handleDeleteLead}
      />

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <Pagination
          page={filters.page}
          totalPages={totalPages}
          totalCount={totalCount}
          perPage={PER_PAGE}
          onChange={(p) => updateFilters({ page: p })}
        />
      )}

      {/* ── Bulk action bar (slides in from bottom) ── */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        batches={batches}
        teamMembers={teamMembers}
        isAdmin={isAdmin}
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkStatus={handleBulkStatus}
        onBulkAssign={handleBulkAssign}
        onBulkBatch={handleBulkBatch}
        onBulkDelete={handleBulkDelete}
      />

      {/* ── Create lead modal ── */}
      <CreateLeadModal
        open={createOpen}
        batches={batches}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateLead}
      />

      {/* ── Lead full panel ── */}
      {selectedLeadId && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setSelectedLeadId(null)}
          />
          <LeadFullPanel
            leadId={selectedLeadId}
            teamMembers={teamMembers}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            canEditBatch={true}
            onClose={() => setSelectedLeadId(null)}
            onLeadChange={(patch) => {
              if (patch.status)          handleStatusChange(selectedLeadId, patch.status)
              if (patch.interest_status) handleInterestChange(selectedLeadId, patch.interest_status)
            }}
          />
        </>
      )}
    </div>
  )
}

// ── Pagination ─────────────────────────────────────────────────────────────
function Pagination({
  page,
  totalPages,
  totalCount,
  perPage,
  onChange,
}: {
  page:       number
  totalPages: number
  totalCount: number
  perPage:    number
  onChange:   (p: number) => void
}) {
  const from = (page - 1) * perPage + 1
  const to   = Math.min(page * perPage, totalCount)

  // Build page range with ellipsis
  const range: (number | '…')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) range.push(i)
  } else {
    range.push(1)
    if (page > 3)            range.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) range.push(i)
    if (page < totalPages - 2) range.push('…')
    range.push(totalPages)
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of <strong>{totalCount.toLocaleString()}</strong> leads
      </p>

      <div className="flex items-center gap-1">
        <PagBtn disabled={page <= 1}      onClick={() => onChange(page - 1)}>← Prev</PagBtn>

        {range.map((r, i) =>
          r === '…' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
          ) : (
            <PagBtn key={r} active={r === page} onClick={() => onChange(r)}>{r}</PagBtn>
          )
        )}

        <PagBtn disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</PagBtn>
      </div>
    </div>
  )
}

function PagBtn({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  active?:   boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-[32px] h-8 rounded-lg px-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'pointer-events-none opacity-40'
      )}
    >
      {children}
    </button>
  )
}
