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
  | 'full_name'
  | 'first_name'
  | 'last_name'
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

export type FieldMapping = Record<string, CrmFieldKey>

/** Fields that map directly onto lead columns */
export const STANDARD_CRM_FIELDS: CrmFieldKey[] = [
  'email', 'first_name', 'last_name', 'phone',
  'title', 'company', 'website', 'linkedin_url',
]

/** Fields stored in custom_fields JSON for secondary contact info */
const CUSTOM_FIELD_KEYS = new Set<CrmFieldKey>([
  'email_2', 'email_3', 'phone_2', 'phone_3', 'company_phone', 'contact_state',
])

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
  mapping: FieldMapping,
  customFieldNames: Record<string, string> = {}
): MappedRawRow {
  const result: Record<string, string | Record<string, string>> = {}
  const customFields: Record<string, string> = {}

  for (const [csvColumn, crmField] of Object.entries(mapping)) {
    if (crmField === 'ignore') continue

    const value = rawRow[csvColumn]?.trim() ?? ''
    if (!value) continue

    if (crmField === 'full_name') {
      // Split "First Last" into first_name + last_name
      const parts = value.trim().split(/\s+/)
      if (parts.length >= 2) {
        result.first_name = parts[0]
        result.last_name  = parts.slice(1).join(' ')
      } else {
        result.first_name = parts[0]
      }
    } else if (CUSTOM_FIELD_KEYS.has(crmField)) {
      // Secondary contact info → stored in custom_fields
      customFields[crmField] = value
    } else if (crmField === 'custom') {
      const displayName = customFieldNames[csvColumn]?.trim()
      const key = displayName ? sanitiseCustomKey(displayName) : sanitiseCustomKey(csvColumn)
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
 */
export function applyMappingToAll(
  rows: Record<string, string>[],
  mapping: FieldMapping,
  customFieldNames: Record<string, string> = {}
): MappedRawRow[] {
  return rows.map((row) => applyMapping(row, mapping, customFieldNames))
}

// ── Auto-detection ─────────────────────────────────────────────────────────
/**
 * Heuristically detect the best CRM field for a given CSV column header.
 * Used to pre-populate the field mapping UI.
 */
export function autoDetectField(csvHeader: string): CrmFieldKey {
  // Normalise: lowercase, remove separators
  const s = csvHeader.toLowerCase().replace(/[\s_\-\.]/g, '')

  // Full name
  if (s === 'name' || s === 'fullname' || s === 'contactfullname' || s === 'contactname') return 'full_name'
  if (s === 'firstname' || s === 'fname' || s === 'first' || s === 'givenname') return 'ignore'
  if (s === 'lastname'  || s === 'lname' || s === 'last'  || s === 'surname' || s === 'familyname') return 'ignore'

  // Emails
  if (s === 'email1' || s === 'email' || s === 'emailaddress') return 'email'
  if (s === 'email2') return 'email_2'
  if (s === 'email3' || s === 'contactemail') return 'email_3'
  if (s.includes('emailvalid') || s.includes('emailtotal')) return 'ignore'
  if (s.includes('email') || s.includes('mail')) return 'email'

  // Phones
  if (s === 'contactphone1' || s === 'phone1' || s === 'phone' || s === 'mobile') return 'phone'
  if (s === 'contactphone2' || s === 'phone2') return 'phone_2'
  if (s === 'contactphone3' || s === 'phone3') return 'phone_3'
  if (s.includes('companyphone') || s.includes('businessphone')) return 'company_phone'
  if (s.includes('phone') || s.includes('mobile') || s.includes('tel') || s.includes('cell')) return 'phone'

  // LinkedIn — must come before generic URL/website checks
  if (s.includes('linkedin') || s === 'liprofile' || s === 'contactliprofileurl') return 'linkedin_url'

  // Other standard fields
  if (s.includes('company') || s === 'organization' || s === 'org' || s === 'employer') return 'company'
  if (s.includes('title') || s === 'jobtitle' || s === 'position' || s === 'designation') return 'title'
  if (s.includes('website') || s === 'domain' || s === 'site' || s === 'web') return 'website'

  // State / location
  if (s === 'contactstate' || s === 'contactstateabbr' || s === 'state' || s === 'stateabbr' || s === 'province') return 'contact_state'

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
