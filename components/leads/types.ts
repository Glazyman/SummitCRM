/**
 * components/leads/types.ts
 *
 * Frontend-specific types for the lead dashboard.
 * LeadRow = Lead + joined data (batch name, assigned name, last activity).
 */
import type { LeadStatus } from '@/types/database'

export type { LeadStatus }

// ── Enriched row returned from the API or server component ────────────────
export interface LeadRow {
  id:               string
  workspace_id:     string
  first_name:       string | null
  last_name:        string | null
  email:            string
  phone:            string | null
  company:          string | null
  title:            string | null
  website:          string | null
  linkedin_url:     string | null
  status:           LeadStatus
  batch_id:         string | null
  batch_name:       string | null
  assigned_to:      string | null
  assigned_name:    string | null  // joined from workspace_members
  source:           string | null
  last_activity_at: string | null
  created_at:       string
  updated_at:       string
}

// ── Filter state — serialisable to URL search params ──────────────────────
export type SortField =
  | 'name'
  | 'email'
  | 'company'
  | 'status'
  | 'created_at'
  | 'last_activity_at'

export type SortDir = 'asc' | 'desc'

export interface LeadFilters {
  search:     string
  statuses:   LeadStatus[]    // multi-select
  batchId:    string | null
  assignedTo: string | null
  myLeads:    boolean
  dateFrom:   string          // ISO date string or ''
  dateTo:     string          // ISO date string or ''
  sortBy:     SortField
  sortDir:    SortDir
  page:       number
  perPage:    number
}

export const DEFAULT_FILTERS: LeadFilters = {
  search:     '',
  statuses:   [],
  batchId:    null,
  assignedTo: null,
  myLeads:    false,
  dateFrom:   '',
  dateTo:     '',
  sortBy:     'created_at',
  sortDir:    'desc',
  page:       1,
  perPage:    50,
}

// ── Column visibility ─────────────────────────────────────────────────────
export type ColumnId =
  | 'name'
  | 'email'
  | 'company'
  | 'status'
  | 'batch'
  | 'assigned'
  | 'last_activity'
  | 'phone'
  | 'title'
  | 'source'

export interface ColumnDef {
  id:         ColumnId
  label:      string
  sortField?: SortField
  /** Can the user toggle this column off? */
  optional:   boolean
  /** Default visibility */
  defaultOn:  boolean
}

export const COLUMNS: ColumnDef[] = [
  { id: 'name',          label: 'Name',          sortField: 'name',            optional: false, defaultOn: true },
  { id: 'email',         label: 'Email',          sortField: 'email',           optional: false, defaultOn: true },
  { id: 'company',       label: 'Company',        sortField: 'company',         optional: false, defaultOn: true },
  { id: 'status',        label: 'Status',         sortField: 'status',          optional: false, defaultOn: true },
  { id: 'batch',         label: 'Batch',                                        optional: true,  defaultOn: true },
  { id: 'assigned',      label: 'Assigned To',                                  optional: true,  defaultOn: true },
  { id: 'last_activity', label: 'Last Activity',  sortField: 'last_activity_at',optional: true,  defaultOn: true },
  { id: 'phone',         label: 'Phone',                                        optional: true,  defaultOn: false },
  { id: 'title',         label: 'Job Title',                                    optional: true,  defaultOn: false },
  { id: 'source',        label: 'Source',                                       optional: true,  defaultOn: false },
]

// ── Status counts (for status bar) ────────────────────────────────────────
export interface StatusCount {
  status: LeadStatus
  count:  number
}
