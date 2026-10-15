'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Upload, UserPlus, Download, Table2, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks'
import { Button } from '@/components/ui/button'

import { LeadStatusBar }        from '@/components/leads/lead-status-bar'
import { LeadFullPanel }        from '@/components/leads/lead-full-panel'
import { FollowUpPrompt }       from '@/components/leads/detail/follow-up-prompt'
import { LeadFiltersPanel }     from '@/components/leads/lead-filters'
import { LeadTable }            from '@/components/leads/lead-table'
import { BulkActionBar }        from '@/components/leads/bulk-action-bar'
import { ColumnVisibilityMenu } from '@/components/leads/column-visibility-menu'
import { CreateLeadModal }      from '@/components/leads/create-lead-modal'
import { STATUS_CONFIG, INTEREST_CONFIG } from '@/components/leads/status-config'

import { COLUMNS, DEFAULT_FILTERS, DEFAULT_COLUMN_ORDER } from '@/components/leads/types'
import type { LeadRow, LeadFilters, LeadStatus, InterestStatus, ColumnId, SortField, StatusCount } from '@/components/leads/types'
import type { NewLeadData } from '@/components/leads/create-lead-modal'

// ── Types ──────────────────────────────────────────────────────────────────
interface LeadsClientProps {
  initialLeads:  LeadRow[]
  /** Total rows matching the current filter, server-computed (across all pages). */
  totalCount:    number
  /** Per-status counts from the server, used by the status bar. */
  statusCounts:  StatusCount[]
  /** Current page index (1-based) from URL. */
  page:          number
  /** Per-page size from URL (25/50/100). */
  perPage:       number
  batches:       { id: string; name: string }[]
  teamMembers:   { id: string; name: string }[]
  isAdmin:       boolean
  currentUserId: string
  role?:         string
}

// 0 is the sentinel for "All" — slower, opt-in.
const PER_PAGE_OPTIONS = [25, 50, 100, 0] as const

function tomorrowAt11LocalIso() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(11, 0, 0, 0)
  return d.toISOString()
}

// (The previous client-side sortLeads / applyFilters helpers are gone now —
//  the server does both via get_workspace_leads_page.)

// ── Component ──────────────────────────────────────────────────────────────
export function LeadsClient({
  initialLeads,
  totalCount: serverTotalCount,
  statusCounts: serverStatusCounts,
  page: serverPage,
  perPage: serverPerPage,
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
  // useTransition marks the URL push as non-urgent: React keeps the
  // current page (table + counts) rendered while the new server
  // component fetches in the background. No blank flash on page switch.
  const [isNavPending, startNavTransition] = React.useTransition()

  // ── Build initial filters from URL params ────────────────────────────
  const filtersFromUrl = React.useMemo((): LeadFilters => {
    const p = searchParams
    return {
      search:     p.get('q')          ?? '',
      statuses:   (p.get('status')?.split(',').filter(Boolean) ?? []) as LeadStatus[],
      interests:  (p.get('interest')?.split(',').filter(Boolean) ?? []) as import('@/types/database').InterestStatus[],
      batchId:    p.get('batch')      ?? null,
      assignedTo: p.get('assigned')   ?? null,
      myLeads:    p.get('my') === '1',
      coldOnly:   p.get('cold') === '1',
      dateFrom:   p.get('from')       ?? '',
      dateTo:     p.get('to')         ?? '',
      sortBy:     (p.get('sort')      ?? 'last_activity_at') as LeadFilters['sortBy'],
      sortDir:    (p.get('dir')       ?? 'desc') as 'asc' | 'desc',
      page:       serverPage,
      perPage:    serverPerPage,
    }
  // serverPage / serverPerPage are URL-derived on the server; including them
  // ensures the local filters object stays in sync with the canonical URL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, serverPage, serverPerPage])

  // ── State ──────────────────────────────────────────────────────────────
  const [filters, setFilters]           = React.useState<LeadFilters>(filtersFromUrl)
  const [leads, setLeads]               = React.useState<LeadRow[]>(initialLeads)
  const [selectedIds, setSelectedIds]   = React.useState<Set<string>>(new Set())
  // "Select all matching the filter" — bulk operations send the filter
  // spec instead of an IDs array (avoids 10k+ UUID payloads).
  const [selectAllMatching, setSelectAllMatching] = React.useState(false)
  const [createOpen, setCreateOpen]     = React.useState(false)
  // Per-user localStorage key — each user's column preferences are saved separately
  const colConfigKey = `leads_column_config_${currentUserId}`
  const viewModeKey  = `leads_view_mode_${currentUserId}`

  const [visibleColumns, setVisibleCols] = React.useState<Set<ColumnId>>(() => {
    try {
      const saved = localStorage.getItem(colConfigKey)
      if (saved) {
        const parsed = JSON.parse(saved) as { visible: ColumnId[]; order?: ColumnId[] }
        if (Array.isArray(parsed.visible)) {
          const validIds  = new Set(COLUMNS.map(c => c.id))
          const filtered  = parsed.visible.filter(id => validIds.has(id as ColumnId)) as ColumnId[]
          // Only add brand-new columns (ones that didn't exist when the user saved).
          // We detect "new" by checking if they're absent from the saved ORDER list.
          // This avoids re-adding columns the user deliberately turned off.
          const savedOrderSet = new Set(parsed.order ?? filtered)
          COLUMNS.forEach(c => {
            if (!savedOrderSet.has(c.id) && c.defaultOn) filtered.push(c.id)
          })
          const result = new Set(filtered)
          if (isRep) result.delete('assigned') // reps never see the Assigned To column
          return result
        }
      }
    } catch { /* ignore */ }
    const defaults = new Set(COLUMNS.filter((c) => c.defaultOn).map((c) => c.id))
    if (isRep) { defaults.add('phone'); defaults.delete('assigned') }
    return defaults
  })
  const [columnOrder, setColumnOrder] = React.useState<ColumnId[]>(() => {
    try {
      const saved = localStorage.getItem(colConfigKey)
      if (saved) {
        const { order } = JSON.parse(saved) as { order: ColumnId[] }
        if (Array.isArray(order)) {
          const validIds = new Set(DEFAULT_COLUMN_ORDER)
          // Keep saved order for known columns; append genuinely new columns at the end
          const savedValid = order.filter(id => validIds.has(id as ColumnId)) as ColumnId[]
          const savedSet   = new Set(savedValid)
          const newCols    = DEFAULT_COLUMN_ORDER.filter(id => !savedSet.has(id))
          return [...savedValid, ...newCols]
        }
      }
    } catch { /* ignore */ }
    return DEFAULT_COLUMN_ORDER
  })
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null)
  const [statusFollowUpPrompt, setStatusFollowUpPrompt] = React.useState<{
    leadId: string
    leadName: string
    title: string
    notes: string | null
    due_at: string
  } | null>(null)
  const [leadView, setLeadView] = React.useState<'table' | 'cards'>(() => {
    try {
      const saved = localStorage.getItem(viewModeKey)
      return saved === 'cards' ? 'cards' : 'table'
    } catch {
      return 'table'
    }
  })
  // On phones/tablets the wide table is unusable (min-w-760px → horizontal
  // scroll), so force the card view. Desktop (≥ lg) keeps the saved preference.
  const isMobile = useIsMobile()
  const effectiveLeadView = isMobile ? 'cards' : leadView

  // ── Keep in sync with server ───────────────────────────────────────────
  // When router.refresh() re-runs the server component, initialLeads gets a
  // new reference → sync local state so changes from the detail page show up.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeads(initialLeads)
  }, [initialLeads])

  // ── Display state — server already did the filter/sort/paginate ──────
  // `leads` is the current page exactly as the server returned it. Counts
  // come from the server too (totalCount + per-status). No client-side
  // re-filter / re-sort / re-slice.
  const totalCount = serverTotalCount
  const perPage    = serverPerPage
  const pageLeads  = leads
  // perPage === 0 means "All" — single page contains everything.
  const totalPages = perPage === 0 ? 1 : Math.max(1, Math.ceil(totalCount / perPage))
  const statusCounts: StatusCount[] = serverStatusCounts

  // Visual selection for the checkbox column. In Select-All-Matching mode
  // we don't populate selectedIds (server operates by filter spec), but
  // the user still expects every row on the page to LOOK checked.
  const visualSelectedIds = React.useMemo(() => {
    if (!selectAllMatching) return selectedIds
    const s = new Set<string>(selectedIds)
    for (const l of pageLeads) s.add(l.id)
    return s
  }, [selectAllMatching, selectedIds, pageLeads])

  // ── URL sync ──────────────────────────────────────────────────────────
  // Server-side pagination: pushing the URL re-runs the server component
  // with the new params (router.push, not replace — replace would silently
  // update history but NOT re-fetch). The page RPC then returns the right
  // slice + counts. Only push if the URL is actually different to avoid
  // an infinite loop with filtersFromUrl.
  React.useEffect(() => {
    const params = new URLSearchParams()
    if (filters.search)               params.set('q',        filters.search)
    if (filters.statuses.length > 0)  params.set('status',   filters.statuses.join(','))
    if (filters.interests.length > 0) params.set('interest', filters.interests.join(','))
    if (filters.batchId)             params.set('batch',    filters.batchId)
    if (filters.assignedTo)          params.set('assigned', filters.assignedTo)
    if (filters.myLeads)             params.set('my',       '1')
    if (filters.coldOnly)            params.set('cold',     '1')
    if (filters.dateFrom)            params.set('from',     filters.dateFrom)
    if (filters.dateTo)              params.set('to',       filters.dateTo)
    if (filters.sortBy !== 'last_activity_at') params.set('sort', filters.sortBy)
    if (filters.sortDir !== 'desc')      params.set('dir',  filters.sortDir)
    if (filters.page > 1)            params.set('page',     String(filters.page))
    if (filters.perPage !== 50)      params.set('per',      filters.perPage === 0 ? 'all' : String(filters.perPage))

    const qs    = params.toString()
    const next  = `${pathname}${qs ? `?${qs}` : ''}`
    const curQS = searchParams.toString()
    const curr  = `${pathname}${curQS ? `?${curQS}` : ''}`
    if (next !== curr) {
      startNavTransition(() => router.push(next, { scroll: false }))
    }
  }, [filters, pathname, router, searchParams])

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
    // If we're in "select all matching" mode, clicking the header
    // checkbox should fully clear the selection.
    if (selectAllMatching) {
      handleClearSelection()
      return
    }
    if (pageLeads.every((l) => selectedIds.has(l.id))) {
      // Deselect page
      setSelectedIds((s) => {
        const next = new Set(s)
        pageLeads.forEach((l) => next.delete(l.id))
        return next
      })
    } else {
      // Select page
      setSelectedIds((s) => {
        const next = new Set(s)
        pageLeads.forEach((l) => next.add(l.id))
        return next
      })
    }
  }

  function handleSelectAllFiltered() {
    // Flip into "select all matching" mode — bulk ops will use the
    // filter spec rather than enumerating IDs. Page-level selectedIds
    // is also cleared so the UI clearly shows the global selection.
    setSelectAllMatching(true)
    setSelectedIds(new Set())
  }

  function handleClearSelection() {
    setSelectedIds(new Set())
    setSelectAllMatching(false)
  }

  /** Build the filter spec the bulk endpoints expect when scope=all_matching. */
  function currentFilterSpec() {
    return {
      search:              filters.search || null,
      statuses:            filters.statuses.length  > 0 ? filters.statuses  : null,
      interests:           filters.interests.length > 0 ? filters.interests : null,
      batch_id:            filters.batchId,
      assigned_to:         filters.assignedTo === 'unassigned' ? null : filters.assignedTo,
      assigned_unassigned: filters.assignedTo === 'unassigned',
      my_leads:            filters.myLeads,
      cold_only:           filters.coldOnly,
      date_from:           filters.dateFrom || null,
      date_to:             filters.dateTo   || null,
    }
  }

  function handleSelectRow(id: string) {
    // Clicking an individual row while in "select all matching" mode
    // collapses that mode and re-establishes a normal page-level
    // selection (every other visible row stays checked).
    if (selectAllMatching) {
      const next = new Set<string>()
      for (const l of pageLeads) if (l.id !== id) next.add(l.id)
      setSelectAllMatching(false)
      setSelectedIds(next)
      return
    }
    setSelectedIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Inline status change (optimistic + API) ──────────────────────────
  async function handleStatusChange(leadId: string, status: LeadStatus, source: 'list' | 'panel' = 'list') {
    const previous = leads
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status, updated_at: new Date().toISOString() } : l))
    )
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error('Status update failed')
      if (source === 'list' && json.follow_up_suggestion) {
        const lead = leads.find((l) => l.id === leadId)
        const leadName = lead ? ([lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email) : 'Lead'
        setStatusFollowUpPrompt({
          leadId,
          leadName,
          ...(json.follow_up_suggestion as { title: string; notes: string | null; due_at: string }),
          due_at: tomorrowAt11LocalIso(),
        })
      }
    } catch (err) {
      console.error(err)
      setLeads(previous)
    }
    // Refresh server props so status_counts and totalCount track changes.
    router.refresh()
  }

  // ── Inline interest change (optimistic + API) ─────────────────────────
  async function handleInterestChange(leadId: string, interest_status: InterestStatus) {
    const previous = leads
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, interest_status, updated_at: new Date().toISOString() } : l))
    )
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ interest_status }),
      })
      if (!res.ok) throw new Error('Interest update failed')
    } catch (err) {
      console.error(err)
      setLeads(previous)
    }
    router.refresh()
  }

  // ── Bulk actions ───────────────────────────────────────────────────────
  // When `selectAllMatching` is on, the request body becomes
  // { scope: 'all_matching', filter: <spec>, ...fields } and the server
  // operates over every matching row without us sending IDs. Otherwise
  // we keep the legacy `{ ids, ...fields }` shape.

  function bulkBody(extra: Record<string, unknown>) {
    if (selectAllMatching) return { scope: 'all_matching', filter: currentFilterSpec(), ...extra }
    return { ids: [...selectedIds], ...extra }
  }

  async function handleBulkStatus(status: LeadStatus) {
    const ids = selectAllMatching ? null : [...selectedIds]
    // Optimistic update for the current page only
    if (ids) {
      setLeads((prev) =>
        prev.map((l) => ids.includes(l.id) ? { ...l, status, updated_at: new Date().toISOString() } : l)
      )
    }
    handleClearSelection()
    try {
      await fetch('/api/leads/bulk', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(bulkBody({ status })),
      })
    } catch (err) {
      console.error('[bulk status]', err)
    }
    router.refresh()
  }

  async function handleBulkAssign(userId: string) {
    const ids    = selectAllMatching ? null : [...selectedIds]
    const member = teamMembers.find((m) => m.id === userId)
    if (ids) {
      setLeads((l) =>
        l.map((lead) => ids.includes(lead.id)
          ? { ...lead, assigned_to: userId || null, assigned_name: member?.name ?? null, updated_at: new Date().toISOString() }
          : lead
        )
      )
    }
    handleClearSelection()
    try {
      await fetch('/api/leads/bulk', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(bulkBody({ assigned_to: userId || null })),
      })
    } catch (err) {
      console.error('[bulk assign]', err)
    }
    router.refresh()
  }

  async function handleBulkBatch(batchId: string) {
    const ids   = selectAllMatching ? null : [...selectedIds]
    const batch = batches.find((b) => b.id === batchId)
    if (ids) {
      setLeads((prev) =>
        prev.map((l) => ids.includes(l.id)
          ? { ...l, batch_id: batchId, batch_name: batch?.name ?? null, updated_at: new Date().toISOString() }
          : l
        )
      )
    }
    handleClearSelection()
    try {
      await fetch('/api/leads/bulk', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(bulkBody({ batch_id: batchId })),
      })
    } catch (err) {
      console.error('[bulk batch]', err)
    }
    router.refresh()
  }

  async function handleBulkDelete() {
    const ids = selectAllMatching ? null : [...selectedIds]
    if (ids) setLeads((prev) => prev.filter((l) => !ids.includes(l.id)))
    handleClearSelection()
    try {
      await fetch('/api/leads/bulk', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(selectAllMatching ? { scope: 'all_matching', filter: currentFilterSpec() } : { ids }),
      })
    } catch (err) {
      console.error('[bulk delete]', err)
    }
    router.refresh()
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
        last_contacted_at:null,
        last_call_outcome:null,
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
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
      localStorage.setItem(colConfigKey, JSON.stringify({
        order,
        visible: [...visible],
      }))
    } catch { /* ignore */ }
  }

  function handleExport() {
    const headers = ['Name', 'Email', 'Company', 'Title', 'Status', 'Batch', 'Assigned To', 'Created At']
    // Exports only the current page. CSV-export-of-all-matching would need
    // a streaming endpoint; out of scope for now.
    const rows    = pageLeads.map((l) => [
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

  function setViewMode(mode: 'table' | 'cards') {
    setLeadView(mode)
    try { localStorage.setItem(viewModeKey, mode) } catch {}
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-7 pb-24">

      {/* ── Page header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isRep ? 'My Leads' : 'Leads'}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {totalCount.toLocaleString()} lead{totalCount !== 1 ? 's' : ''}
            {filters.batchId && batches.find(b => b.id === filters.batchId) && ` · ${batches.find(b => b.id === filters.batchId)!.name}`}
            {(filters.search || filters.statuses.length > 0 || filters.interests.length > 0 || filters.coldOnly) && ' matching filters'}
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
      {/* statusCounts comes from the server and intentionally ignores the
          status filter, so summing the buckets gives "total across all
          statuses for the rest of the filters" — what the bar needs. */}
      <LeadStatusBar
        counts={statusCounts}
        totalCount={statusCounts.reduce((acc, c) => acc + c.count, 0)}
        activeStatuses={filters.statuses}
        onStatusClick={handleStatusFilter}
        coldOnly={filters.coldOnly}
        onColdOnlyToggle={() => updateFilters({ coldOnly: !filters.coldOnly, page: 1 })}
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

      {statusFollowUpPrompt && (
        <FollowUpPrompt
          leadId={statusFollowUpPrompt.leadId}
          title={statusFollowUpPrompt.title}
          notes={statusFollowUpPrompt.notes}
          assigneeId={currentUserId}
          message={`${statusFollowUpPrompt.leadName}: add a follow-up task?`}
          onScheduled={() => { setStatusFollowUpPrompt(null); router.refresh() }}
          onDismiss={() => setStatusFollowUpPrompt(null)}
        />
      )}

      {/* ── Toolbar: results count + per-page + columns ── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {selectedIds.size > 0 ? (
              <span className="font-medium text-foreground">{selectedIds.size.toLocaleString()} selected</span>
            ) : (
              <span>
                Showing {pageLeads.length.toLocaleString()} of {totalCount.toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Table/Cards toggle is desktop-only — mobile is always cards */}
            <div className="hidden lg:flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1',
                  leadView === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Table2 className="h-3.5 w-3.5" /> Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1',
                  leadView === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Cards
              </button>
            </div>
            {/* Per-page selector */}
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground hidden sm:inline">Per page:</span>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {PER_PAGE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => updateFilters({ perPage: n, page: 1 })}
                    title={n === 0 ? 'Loads every lead in one go — slower' : undefined}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium transition-colors',
                      (filters.perPage === n)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {n === 0 ? 'All' : n}
                  </button>
                ))}
              </div>
            </div>
            {/* Column controls only apply to the table (desktop) */}
            <div className="hidden lg:block">
              <ColumnVisibilityMenu
                visibleColumns={visibleColumns}
                columnOrder={columnOrder}
                onToggle={handleToggleColumn}
                onReorder={handleReorderColumns}
                onSave={handleSaveColumns}
                hiddenColumnIds={isRep ? new Set<ColumnId>(['assigned']) : undefined}
              />
            </div>
          </div>
        </div>

        {/* "Select all X leads" banner — shown when page is fully selected but not all */}
        {selectedIds.size > 0 && selectedIds.size < totalCount && pageLeads.every(l => selectedIds.has(l.id)) && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm">
            <span className="text-foreground">
              {selectedIds.size.toLocaleString()} leads on this page selected.
            </span>
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="font-medium text-primary hover:underline"
            >
              Select all {totalCount.toLocaleString()} leads
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}

        {/* "All X selected" confirmation (server-side select-all-matching) */}
        {selectAllMatching && totalCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm">
            <span className="text-foreground font-medium">All {totalCount.toLocaleString()} leads selected.</span>
            <button
              type="button"
              onClick={handleClearSelection}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      {/* ── Lead view ── */}
      {effectiveLeadView === 'table' ? (
        <LeadTable
          leads={pageLeads}
          selectedIds={visualSelectedIds}
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
          onSendEmail={(lead) => {
            window.location.href = `mailto:${lead.email}`
          }}
          onDeleteLead={handleDeleteLead}
        />
      ) : (
        <LeadsCardsView
          leads={pageLeads}
          onOpenLead={(id) => setSelectedLeadId(id)}
        />
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <Pagination
          page={filters.page}
          totalPages={totalPages}
          totalCount={totalCount}
          perPage={perPage}
          onChange={(p) => updateFilters({ page: p })}
        />
      )}

      {/* ── Bulk action bar (slides in from bottom) ──
          Visible when either: rows on the page are checked, OR the user
          flipped into "Select All Matching" mode (selectedIds is empty
          in that case because we're operating by filter spec). */}
      <BulkActionBar
        selectedCount={selectAllMatching ? totalCount : selectedIds.size}
        batches={batches}
        teamMembers={teamMembers}
        isAdmin={isAdmin}
        onClearSelection={handleClearSelection}
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
            canEditBatch={isAdmin}
            onClose={() => setSelectedLeadId(null)}
            onLeadChange={(patch) => {
              // The side panel already PATCHed the API — only sync the local
              // list row here. Calling handleStatusChange / handleInterestChange
              // would fire a second PATCH and, on a race, the parent's catch
              // block would roll back the list to "new" even though the DB
              // was correctly updated.
              setLeads((prev) =>
                prev.map((l) =>
                  l.id === selectedLeadId
                    ? { ...l, ...(patch as unknown as Partial<LeadRow>), updated_at: new Date().toISOString() }
                    : l
                )
              )
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

function LeadsCardsView({
  leads,
  onOpenLead,
}: {
  leads: LeadRow[]
  onOpenLead: (id: string) => void
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        No leads found.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {leads.map((lead) => {
        const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
        const statusMeta = STATUS_CONFIG[lead.status]
        const interestMeta = INTEREST_CONFIG[lead.interest_status]
        return (
          <button
            key={lead.id}
            type="button"
            onClick={() => onOpenLead(lead.id)}
            className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/25"
          >
            <p className="truncate font-semibold">{name}</p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{lead.company ?? 'No company'}</p>
            <p className="mt-2 truncate text-sm">{lead.email}</p>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold', statusMeta.badge)}>
                  {statusMeta.label}
                </span>
                <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold', interestMeta.badge)}>
                  {interestMeta.label}
                </span>
              </div>
              <span>{new Date(lead.created_at).toLocaleDateString()}</span>
            </div>
          </button>
        )
      })}
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
