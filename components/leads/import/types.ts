// ── Types shared across the import wizard ─────────────────────────────────

export interface ParsedFile {
  name: string
  size: number
  rowCount: number
  headers: string[]
  /** First 5 rows of data for preview */
  preview: Record<string, string>[]
  /** Raw data for later submission */
  rawData: Record<string, string>[]
}

export type CrmField =
  | 'full_name'
  | 'first_name'    // internal only — set by full_name split
  | 'last_name'     // internal only — set by full_name split
  | 'email'
  | 'email_2'
  | 'email_3'
  | 'phone'
  | 'phone_2'
  | 'phone_3'
  | 'company_phone'
  | 'title'
  | 'company'
  | 'contact_state'
  | 'website'
  | 'linkedin_url'
  | 'custom'
  | 'ignore'

export const CRM_FIELDS: { value: CrmField; label: string; description?: string }[] = [
  { value: 'full_name',     label: 'Full Name',       description: 'Splits into first + last name' },
  { value: 'email',         label: 'Email (primary)', description: 'Recommended for deduplication' },
  { value: 'email_2',       label: 'Email 2' },
  { value: 'email_3',       label: 'Email 3' },
  { value: 'phone',         label: 'Phone (primary)' },
  { value: 'phone_2',       label: 'Phone 2' },
  { value: 'phone_3',       label: 'Phone 3' },
  { value: 'company_phone', label: 'Company Phone' },
  { value: 'company',       label: 'Company' },
  { value: 'title',         label: 'Job Title' },
  { value: 'contact_state', label: 'State' },
  { value: 'website',       label: 'Website' },
  { value: 'linkedin_url',  label: 'LinkedIn URL' },
  { value: 'custom',        label: 'Custom field' },
  { value: 'ignore',        label: 'Skip / Ignore' },
]

/** Map from CSV column name → CRM field key */
export type FieldMapping = Record<string, CrmField>

export interface ImportOptions {
  /** ID of existing batch, or null to create new */
  batchId: string | null
  /** Name for new batch (used when batchId is null) */
  newBatchName: string
  /** What to do when email already exists in workspace */
  duplicateMode: 'skip' | 'update'
  /** Assign all imported leads to this user ID (optional) */
  assignedTo: string | null
}

/** Custom display names for columns mapped to 'custom' (csvColumn → desired field name) */
export type CustomFieldNames = Record<string, string>

export interface ImportResult {
  importId: string
  total: number
  imported: number
  skipped: number
  failed: number
  errors: ImportError[]
  batchId?: string
  batchName?: string
}

export interface ImportError {
  row: number
  email: string
  reason: string
}

export interface ExistingBatch {
  id: string
  name: string
  leadCount: number
}

// ── Step identifiers ──────────────────────────────────────────────────────
export type WizardStep = 'upload' | 'mapping' | 'options' | 'progress' | 'done'
