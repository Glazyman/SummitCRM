'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowUpDown, ArrowUp, ArrowDown,
  Mail, ExternalLink, MoreHorizontal,
  Building2, User, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { STATUS_CONFIG, ALL_STATUSES, INTEREST_CONFIG, ALL_INTEREST_STATUSES } from './status-config'
import type { LeadRow, SortField, SortDir, ColumnId, InterestStatus } from './types'

// ── Types ─────────────────────────────────────────────────────────────────
interface LeadTableProps {
  leads:            LeadRow[]
  selectedIds:      Set<string>
  sortBy:           SortField
  sortDir:          SortDir
  visibleColumns:   Set<ColumnId>
  isAdmin:          boolean
  onSelectAll:      () => void
  onSelectRow:      (id: string) => void
  onSort:           (field: SortField) => void
  onStatusChange:   (leadId: string, status: LeadRow['status']) => void
  onInterestChange: (leadId: string, interest: InterestStatus) => void
  onRowClick:       (lead: LeadRow) => void
  onSendEmail:      (lead: LeadRow) => void
  onDeleteLead:     (leadId: string) => void
  loading?:         boolean
}

// ── Main table ─────────────────────────────────────────────────────────────
export function LeadTable({
  leads,
  selectedIds,
  sortBy,
  sortDir,
  visibleColumns,
  isAdmin,
  onSelectAll,
  onSelectRow,
  onSort,
  onStatusChange,
  onInterestChange,
  onRowClick,
  onSendEmail,
  onDeleteLead,
  loading,
}: LeadTableProps) {
  const allSelected     = leads.length > 0 && leads.every((l) => selectedIds.has(l.id))
  const someSelected    = leads.some((l) => selectedIds.has(l.id)) && !allSelected

  if (loading) {
    return <TableSkeleton />
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <User className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold">No leads found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your filters or import new leads.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[700px] text-sm">
        {/* ── Header ── */}
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {/* Checkbox */}
            <th className="w-10 px-4 py-3">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={onSelectAll}
                aria-label="Select all"
              />
            </th>

            {/* Name */}
            <SortHeader field="name" current={sortBy} dir={sortDir} onSort={onSort} className="min-w-[180px]">
              Name
            </SortHeader>

            {/* Email */}
            {visibleColumns.has('email') && (
              <SortHeader field="email" current={sortBy} dir={sortDir} onSort={onSort} className="min-w-[200px]">
                Email
              </SortHeader>
            )}

            {/* Company */}
            {visibleColumns.has('company') && (
              <SortHeader field="company" current={sortBy} dir={sortDir} onSort={onSort} className="min-w-[140px]">
                Company
              </SortHeader>
            )}

            {/* Title (optional) */}
            {visibleColumns.has('title') && (
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Title
              </th>
            )}

            {/* Status */}
            {visibleColumns.has('status') && (
              <SortHeader field="status" current={sortBy} dir={sortDir} onSort={onSort} className="min-w-[140px]">
                Status
              </SortHeader>
            )}

            {/* Interest */}
            {visibleColumns.has('interest') && (
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-muted-foreground min-w-[130px]">
                Interest
              </th>
            )}

            {/* Batch */}
            {visibleColumns.has('batch') && (
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Batch
              </th>
            )}

            {/* Assigned (admin only) */}
            {visibleColumns.has('assigned') && isAdmin && (
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Assigned To
              </th>
            )}

            {/* Phone (optional) */}
            {visibleColumns.has('phone') && (
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Phone
              </th>
            )}

            {/* Company Phone (optional) */}
            {visibleColumns.has('company_phone') && (
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Company Phone
              </th>
            )}

            {/* Last Activity */}
            {visibleColumns.has('last_activity') && (
              <SortHeader field="last_activity_at" current={sortBy} dir={sortDir} onSort={onSort} className="min-w-[120px]">
                Last Activity
              </SortHeader>
            )}

            {/* Actions */}
            <th className="w-20 px-4 py-3" />
          </tr>
        </thead>

        {/* ── Body ── */}
        <tbody className="divide-y divide-border">
          {leads.map((lead) => (
            <LeadTableRow
              key={lead.id}
              lead={lead}
              selected={selectedIds.has(lead.id)}
              visibleColumns={visibleColumns}
              isAdmin={isAdmin}
              onSelect={() => onSelectRow(lead.id)}
              onStatusChange={(s) => onStatusChange(lead.id, s)}
              onInterestChange={(s) => onInterestChange(lead.id, s)}
              onRowClick={() => onRowClick(lead)}
              onSendEmail={() => onSendEmail(lead)}
              onDelete={() => onDeleteLead(lead.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Row ────────────────────────────────────────────────────────────────────
interface RowProps {
  lead:             LeadRow
  selected:         boolean
  visibleColumns:   Set<ColumnId>
  isAdmin:          boolean
  onSelect:         () => void
  onStatusChange:   (s: LeadRow['status']) => void
  onInterestChange: (s: InterestStatus) => void
  onRowClick:       () => void
  onSendEmail:      () => void
  onDelete:         () => void
}

function LeadTableRow({
  lead, selected, visibleColumns, isAdmin,
  onSelect, onStatusChange, onInterestChange, onRowClick, onSendEmail, onDelete,
}: RowProps) {
  const router = useRouter()
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'

  return (
    <tr
      onClick={onRowClick}
      className={cn(
        'group cursor-pointer transition-colors',
        selected
          ? 'bg-primary/5'
          : 'hover:bg-muted/40'
      )}
    >
      {/* Checkbox */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onChange={onSelect}
          aria-label={`Select ${name}`}
        />
      </td>

      {/* Name */}
      <td className="px-4 py-3">
        <span className="font-medium text-foreground">{name}</span>
        {lead.title && (
          <span className="mt-0.5 block text-xs text-muted-foreground truncate max-w-[160px]">
            {lead.title}
          </span>
        )}
      </td>

      {/* Email */}
      {visibleColumns.has('email') && (
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <MultiContactCell
            primary={lead.email ?? null}
            extras={[lead.custom_fields?.email_2, lead.custom_fields?.email_3].filter(Boolean) as string[]}
            type="email"
          />
        </td>
      )}

      {/* Company */}
      {visibleColumns.has('company') && (
        <td className="px-4 py-3">
          {lead.company ? (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              <span className="truncate max-w-[120px]">{lead.company}</span>
            </div>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>
      )}

      {/* Title */}
      {visibleColumns.has('title') && (
        <td className="px-4 py-3 text-muted-foreground">
          {lead.title ?? <span className="text-muted-foreground/40">—</span>}
        </td>
      )}

      {/* Status — inline dropdown */}
      {visibleColumns.has('status') && (
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <StatusDropdown
            value={lead.status}
            onChange={onStatusChange}
          />
        </td>
      )}

      {/* Interest — inline dropdown */}
      {visibleColumns.has('interest') && (
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <InterestDropdown
            value={lead.interest_status}
            onChange={onInterestChange}
          />
        </td>
      )}

      {/* Batch */}
      {visibleColumns.has('batch') && (
        <td className="px-4 py-3 text-muted-foreground">
          {lead.batch_name ? (
            <span className="truncate max-w-[120px] block text-xs">{lead.batch_name}</span>
          ) : (
            <span className="text-muted-foreground/40 text-xs">—</span>
          )}
        </td>
      )}

      {/* Assigned */}
      {visibleColumns.has('assigned') && isAdmin && (
        <td className="px-4 py-3">
          {lead.assigned_name ? (
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                {lead.assigned_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs">{lead.assigned_name}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/40">Unassigned</span>
          )}
        </td>
      )}

      {/* Phone */}
      {visibleColumns.has('phone') && (
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <MultiContactCell
            primary={lead.phone ?? null}
            extras={[lead.custom_fields?.phone_2, lead.custom_fields?.phone_3].filter(Boolean) as string[]}
            type="phone"
          />
        </td>
      )}

      {/* Company Phone */}
      {visibleColumns.has('company_phone') && (
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <MultiContactCell
            primary={lead.custom_fields?.company_phone ?? null}
            extras={[lead.custom_fields?.company_phone_2].filter(Boolean) as string[]}
            type="phone"
          />
        </td>
      )}

      {/* Last Activity */}
      {visibleColumns.has('last_activity') && (
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {lead.last_activity_at
            ? relativeTime(lead.last_activity_at)
            : <span className="text-muted-foreground/40">No activity</span>
          }
        </td>
      )}

      {/* Actions */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip content="Send email">
            <button
              type="button"
              onClick={onSendEmail}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip content="View lead">
            <Link
              href={`/leads/${lead.id}`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" minWidth="160px">
              <DropdownMenuItem onClick={() => router.push(`/leads/${lead.id}`)} icon={<ExternalLink className="h-3.5 w-3.5" />}>
                View Lead
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSendEmail} icon={<Mail className="h-3.5 w-3.5" />}>
                Send Email
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={onDelete}>
                Delete Lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  )
}

// ── Inline status dropdown ────────────────────────────────────────────────
function StatusDropdown({
  value,
  onChange,
}: {
  value:    LeadRow['status']
  onChange: (s: LeadRow['status']) => void
}) {
  const meta = STATUS_CONFIG[value]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
            'cursor-pointer transition-all hover:opacity-80 active:scale-95',
            meta.badge
          )}
        >
          {meta.label}
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" minWidth="170px" side="top">
        {ALL_STATUSES.map((status) => {
          const m       = STATUS_CONFIG[status]
          const current = status === value
          return (
            <DropdownMenuItem
              key={status}
              onClick={() => !current && onChange(status)}
              className={cn(current && 'opacity-50 cursor-default')}
            >
              <span className={cn('h-2 w-2 rounded-full', m.dot)} />
              {m.label}
              {current && <span className="ml-auto text-xs text-muted-foreground">current</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Inline interest dropdown ──────────────────────────────────────────────
function InterestDropdown({
  value,
  onChange,
}: {
  value:    InterestStatus
  onChange: (s: InterestStatus) => void
}) {
  const meta = INTEREST_CONFIG[value] ?? INTEREST_CONFIG['pending']

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
            'cursor-pointer transition-all hover:opacity-80 active:scale-95',
            meta.badge
          )}
        >
          {meta.label}
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" minWidth="155px" side="top">
        {ALL_INTEREST_STATUSES.map((status) => {
          const m       = INTEREST_CONFIG[status]
          const current = status === value
          return (
            <DropdownMenuItem
              key={status}
              onClick={() => !current && onChange(status)}
              className={cn(current && 'opacity-50 cursor-default')}
            >
              <span className={cn('h-2 w-2 rounded-full', m.dot)} />
              {m.label}
              {current && <span className="ml-auto text-xs text-muted-foreground">current</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Multi-contact hover cell ──────────────────────────────────────────────
function MultiContactCell({
  primary,
  extras,
  type,
}: {
  primary: string | null
  extras:  string[]
  type:    'email' | 'phone'
}) {
  const [open, setOpen] = React.useState(false)
  const all = [primary, ...extras].filter(Boolean) as string[]

  if (!primary) return <span className="text-xs text-muted-foreground/40">—</span>

  const label = (
    <button
      type="button"
      onClick={() => {
        if (type === 'email') navigator.clipboard.writeText(primary)
      }}
      className="font-mono text-xs text-muted-foreground hover:text-foreground truncate max-w-[160px]"
    >
      {primary}
    </button>
  )

  if (extras.length === 0) return label

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <div className="flex items-center gap-1">
        {label}
        <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
          +{extras.length}
        </span>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-popover shadow-card p-2 space-y-1">
          {all.map((val, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground w-3 shrink-0">{i + 1}.</span>
              {type === 'email' ? (
                <a href={`mailto:${val}`} className="text-primary hover:underline truncate">{val}</a>
              ) : (
                <a href={`tel:${val}`} className="hover:underline truncate">{val}</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sort header ───────────────────────────────────────────────────────────
interface SortHeaderProps {
  field:     SortField
  current:   SortField
  dir:       SortDir
  onSort:    (f: SortField) => void
  children:  React.ReactNode
  className?: string
}

function SortHeader({ field, current, dir, onSort, children, className }: SortHeaderProps) {
  const active = current === field
  return (
    <th className={cn('px-4 py-3', className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium',
          'rounded px-1 -mx-1 py-0.5 transition-colors',
          active
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {children}
        {active ? (
          dir === 'asc'
            ? <ArrowUp className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {['w-10', 'w-40', 'w-48', 'w-32', 'w-28', 'w-24', 'w-28', 'w-20'].map((w, i) => (
              <th key={i} className={cn('px-4 py-3', w)}>
                <div className="h-3 w-full rounded bg-muted animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              {[10, 40, 48, 32, 28, 24, 28, 20].map((w, j) => (
                <td key={j} className="px-4 py-3.5">
                  <div
                    className="h-3 rounded bg-muted animate-pulse"
                    style={{ width: `${w * 4}px`, animationDelay: `${i * 60 + j * 20}ms` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Relative time helper ──────────────────────────────────────────────────
export function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)

  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  if (days < 30)  return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

// Re-export for use in other components
export { StatusDropdown }
