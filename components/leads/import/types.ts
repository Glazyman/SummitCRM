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
  | 'email'
  | 'first_name'
  | 'last_name'
  | 'phone'
  | 'title'
  | 'company'
  | 'website'
  | 'linkedin_url'
  | 'custom'
  | 'ignore'

export const CRM_FIELDS: { value: CrmField; label: string; required?: boolean; description?: string }[] = [
  { value: 'email',        label: 'Email',        required: true,  description: 'Required' },
  { value: 'first_name',   label: 'First Name' },
  { value: 'last_name',    label: 'Last Name' },
  { value: 'company',      label: 'Company' },
  { value: 'title',        label: 'Job Title' },
  { value: 'phone',        label: 'Phone' },
  { value: 'website',      label: 'Website' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'custom',       label: 'Custom field' },
  { value: 'ignore',       label: 'Skip / Ignore' },
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
}

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
