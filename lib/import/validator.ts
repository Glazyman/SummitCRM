/**
 * lib/import/validator.ts
 *
 * Row-level validation for lead imports.
 * Pure functions — no DB calls, no side effects.
 * Used by both the Next.js API route and the Supabase Edge Function.
 */
import { z } from 'zod'

// ── Constants ─────────────────────────────────────────────────────────────
export const MAX_ROWS_PER_IMPORT = 10_000
export const INSERT_CHUNK_SIZE   = 500   // rows per Supabase insert call
export const DEDUP_CHUNK_SIZE    = 500   // emails per IN clause
export const MAX_FILE_SIZE_MB    = 25

// ── Normalisation helpers ─────────────────────────────────────────────────

/** Trim + collapse internal whitespace */
function clean(s?: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

/** Ensure URLs include a protocol */
function normaliseUrl(s?: string): string | undefined {
  const v = clean(s)
  if (!v) return undefined
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}

/** Normalise LinkedIn URLs */
function normaliseLinkedIn(s?: string): string | undefined {
  const v = clean(s)
  if (!v) return undefined
  if (/^https?:\/\/(www\.)?linkedin\.com\//i.test(v)) return v
  if (/^linkedin\.com\//i.test(v)) return `https://${v}`
  if (/^\/in\//i.test(v)) return `https://www.linkedin.com${v}`
  if (/^in\//i.test(v)) return `https://www.linkedin.com/${v}`
  // bare username
  if (/^[\w-]+$/.test(v)) return `https://www.linkedin.com/in/${v}`
  return v
}

// ── Zod schema ─────────────────────────────────────────────────────────────
/**
 * Schema for a single mapped row (after FieldMapping applied).
 * Fields come from the mapper — keys are CRM field names.
 */
export const mappedRowSchema = z.object({
  email: z
    .string()
    .max(254, 'Email exceeds maximum length')
    .email('Invalid email format')
    .transform((v) => v.toLowerCase().trim())
    .optional(),

  first_name: z
    .string()
    .max(100, 'First name too long (max 100 chars)')
    .optional()
    .transform((v) => clean(v) || undefined),

  last_name: z
    .string()
    .max(100, 'Last name too long (max 100 chars)')
    .optional()
    .transform((v) => clean(v) || undefined),

  phone: z
    .string()
    .max(30, 'Phone too long (max 30 chars)')
    .optional()
    .transform((v) => clean(v) || undefined),

  title: z
    .string()
    .max(200, 'Job title too long (max 200 chars)')
    .optional()
    .transform((v) => clean(v) || undefined),

  company: z
    .string()
    .max(200, 'Company too long (max 200 chars)')
    .optional()
    .transform((v) => clean(v) || undefined),

  website: z
    .string()
    .max(500, 'Website URL too long')
    .optional()
    .transform((v) => normaliseUrl(v)),

  linkedin_url: z
    .string()
    .max(500, 'LinkedIn URL too long')
    .optional()
    .transform((v) => normaliseLinkedIn(v)),

  custom_fields: z
    .record(z.string(), z.string())
    .optional()
    .default({}),
})

export type ValidatedRow = z.output<typeof mappedRowSchema>
export type MappedRawRow = z.input<typeof mappedRowSchema>

// ── Validation result ──────────────────────────────────────────────────────
export interface RowValidationError {
  row: number       // 1-indexed data row (not counting header)
  email: string     // raw email value (may be empty/invalid)
  reason: string
}

export interface ValidationResult {
  valid: ValidatedRow[]
  errors: RowValidationError[]
}

// ── Main validator ─────────────────────────────────────────────────────────
/**
 * Validate all mapped rows.
 * Never throws — errors are collected and returned alongside valid rows.
 *
 * @param rows      Rows after FieldMapping has been applied
 * @returns         Split of valid rows and row-level errors
 */
export function validateRows(rows: MappedRawRow[]): ValidationResult {
  const valid: ValidatedRow[] = []
  const errors: RowValidationError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1 // 1-indexed

    const result = mappedRowSchema.safeParse(row)

    if (result.success) {
      valid.push(result.data)
    } else {
      const issue = result.error.issues[0]
      errors.push({
        row: rowNum,
        email: typeof row.email === 'string' ? row.email : '',
        reason: issue.message,
      })
    }
  }

  return { valid, errors }
}

/**
 * Quick check before starting a large import:
 * Scan raw rows for an email column and validate it exists and has correct format.
 * Returns a summary without building full error list (fast pre-check).
 */
export function preflightCheck(
  rows: Record<string, string>[],
  emailColumn: string | undefined
): { ok: boolean; reason?: string } {
  if (rows.length === 0) {
    return { ok: false, reason: 'File contains no data rows.' }
  }
  if (rows.length > MAX_ROWS_PER_IMPORT) {
    return {
      ok: false,
      reason: `File contains ${rows.length.toLocaleString()} rows. Maximum is ${MAX_ROWS_PER_IMPORT.toLocaleString()}.`,
    }
  }
  // Email is optional — only validate the column exists if one was mapped
  if (emailColumn && !(emailColumn in rows[0])) {
    return { ok: false, reason: `Column "${emailColumn}" not found in file headers.` }
  }
  return { ok: true }
}
