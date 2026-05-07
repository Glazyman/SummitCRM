/**
 * lib/import/mapper.ts
 *
 * Applies a user-defined FieldMapping to raw CSV/XLSX row data.
 * Pure functions — no DB calls, no side effects.
 *
 * FieldMapping: { csvColumnName → crmFieldKey }
 *   crmFieldKey = 'email' | 'first_name' | ... | 'custom' | 'ignore'
 */
import type { MappedRawRow } from './validator'

// ── Types re-exported for convenience ─────────────────────────────────────
export type CrmFieldKey =
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

export type FieldMapping = Record<string, CrmFieldKey>

/** Standard CRM fields (used for mapping UI labels and validation) */
export const STANDARD_CRM_FIELDS: CrmFieldKey[] = [
  'email', 'first_name', 'last_name', 'phone',
  'title', 'company', 'website', 'linkedin_url',
]

// ── Core mapper ────────────────────────────────────────────────────────────
/**
 * Apply a FieldMapping to a single raw CSV row.
 *
 * - Standard fields (email, first_name, …) are mapped directly.
 * - Columns mapped to 'custom' are collected into `custom_fields` JSONB.
 * - Columns mapped to 'ignore' are discarded.
 * - The CSV column name is used as the custom field key.
 *
 * @param rawRow    One row from PapaParse / SheetJS output
 * @param mapping   User-selected column→field mapping
 * @returns         MappedRawRow ready for schema validation
 */
export function applyMapping(
  rawRow: Record<string, string>,
  mapping: FieldMapping
): MappedRawRow {
  const result: Record<string, string | Record<string, string>> = {}
  const customFields: Record<string, string> = {}

  for (const [csvColumn, crmField] of Object.entries(mapping)) {
    if (crmField === 'ignore') continue

    const value = rawRow[csvColumn]?.trim() ?? ''
    if (!value) continue // skip empty values — don't overwrite defaults with empty

    if (crmField === 'custom') {
      // Store using sanitised column name as key (lowercase, no spaces)
      const key = sanitiseCustomKey(csvColumn)
      customFields[key] = value
    } else {
      result[crmField] = value
    }
  }

  if (Object.keys(customFields).length > 0) {
    result.custom_fields = customFields
  }

  return result as MappedRawRow
}

/**
 * Apply mapping to all rows in the file.
 * Returns an array of MappedRawRow in the same order as input.
 */
export function applyMappingToAll(
  rows: Record<string, string>[],
  mapping: FieldMapping
): MappedRawRow[] {
  return rows.map((row) => applyMapping(row, mapping))
}

// ── Auto-detection ─────────────────────────────────────────────────────────
/**
 * Heuristically detect the best CRM field for a given CSV column header.
 * Used to pre-populate the field mapping UI.
 */
export function autoDetectField(csvHeader: string): CrmFieldKey {
  // Normalise: lowercase, remove separators
  const s = csvHeader.toLowerCase().replace(/[\s_\-\.]/g, '')

  if (s.includes('email') || s.includes('mail')) return 'email'

  if (s === 'firstname' || s === 'fname' || s === 'first' ||
      s === 'givenname' || s === 'forename') return 'first_name'

  if (s === 'lastname'  || s === 'lname'  || s === 'last'  ||
      s === 'surname'   || s === 'familyname') return 'last_name'

  // "name" by itself → first_name (most common)
  if (s === 'name' || s === 'fullname' || s === 'contactname') return 'first_name'

  if (s.includes('company')  || s === 'organization' ||
      s === 'org'            || s === 'employer'      ||
      s === 'firm'           || s === 'business') return 'company'

  if (s.includes('title')    || s === 'jobtitle'     || s === 'position' ||
      s === 'role'           || s === 'designation') return 'title'

  if (s.includes('phone')    || s.includes('mobile') || s.includes('tel') ||
      s.includes('cell')     || s === 'contact') return 'phone'

  if (s.includes('website')  || s === 'domain'       || s === 'site' ||
      s === 'web'            || s === 'url') return 'website'

  if (s.includes('linkedin') || s === 'li' || s === 'linkedinprofile') return 'linkedin_url'

  return 'ignore'
}

/**
 * Build a complete auto-detected mapping for all CSV headers.
 * Ensures each standard field is only mapped once (first match wins).
 */
export function buildAutoMapping(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {}
  const usedStandardFields = new Set<CrmFieldKey>()

  for (const header of headers) {
    const detected = autoDetectField(header)
    if (
      detected !== 'ignore' &&
      detected !== 'custom' &&
      usedStandardFields.has(detected)
    ) {
      // Field already claimed by an earlier column — fall back to custom
      mapping[header] = 'custom'
    } else {
      mapping[header] = detected
      if (detected !== 'ignore' && detected !== 'custom') {
        usedStandardFields.add(detected)
      }
    }
  }

  return mapping
}

// ── Validation helpers ─────────────────────────────────────────────────────
/**
 * Find the CSV column name that maps to 'email'.
 * Returns null if no email column is mapped.
 */
export function findEmailColumn(mapping: FieldMapping): string | null {
  const entry = Object.entries(mapping).find(([, v]) => v === 'email')
  return entry ? entry[0] : null
}

/**
 * Check whether a mapping has an email column assigned.
 */
export function hasMappedEmail(mapping: FieldMapping): boolean {
  return Object.values(mapping).includes('email')
}

/**
 * Return all CRM fields that are mapped to more than one CSV column.
 * Used to warn the user about ambiguous mappings.
 */
export function findDuplicateMappings(mapping: FieldMapping): CrmFieldKey[] {
  const counts = new Map<string, number>()
  for (const val of Object.values(mapping)) {
    if (val === 'ignore' || val === 'custom') continue
    counts.set(val, (counts.get(val) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key as CrmFieldKey)
}

// ── Private helpers ────────────────────────────────────────────────────────
function sanitiseCustomKey(csvColumn: string): string {
  return csvColumn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // replace non-alphanumeric with _
    .replace(/^_+|_+$/g, '')       // trim leading/trailing underscores
    .slice(0, 64)                  // max 64 chars
    || 'custom_field'              // fallback if empty after sanitise
}
