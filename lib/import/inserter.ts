/**
 * lib/import/inserter.ts
 *
 * Chunked batch insert and update logic for lead rows.
 * Inserts in batches of INSERT_CHUNK_SIZE with one retry per failed chunk.
 * Never throws — errors are collected and returned.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { INSERT_CHUNK_SIZE } from './validator'
import type { ValidatedRow } from './validator'

// ── Types ─────────────────────────────────────────────────────────────────
export interface LeadInsert {
  workspace_id:   string
  import_id:      string
  batch_id:       string | null
  assigned_to:    string | null
  email:          string
  first_name?:    string
  last_name?:     string
  phone?:         string
  title?:         string
  company?:       string
  website?:       string
  linkedin_url?:  string
  custom_fields:  Record<string, unknown>
  source:         'csv_import'
  status:         'new'
}

export interface LeadUpdate {
  id:             string  // existing lead ID
  first_name?:    string
  last_name?:     string
  phone?:         string
  title?:         string
  company?:       string
  website?:       string
  linkedin_url?:  string
  custom_fields?: Record<string, unknown>
  updated_at:     string
}

export interface InsertResult {
  inserted:  number
  updated:   number
  errors:    Array<{ email: string; reason: string }>
}

// ── Builder helpers ────────────────────────────────────────────────────────
/**
 * Convert a ValidatedRow into a DB insert record.
 */
export function buildLeadInsert(
  row: ValidatedRow,
  context: {
    workspaceId: string
    importId:    string
    batchId:     string | null
    assignedTo:  string | null
  }
): LeadInsert {
  const record: LeadInsert = {
    workspace_id:  context.workspaceId,
    import_id:     context.importId,
    batch_id:      context.batchId,
    assigned_to:   context.assignedTo,
    email:         row.email,
    custom_fields: row.custom_fields ?? {},
    source:        'csv_import',
    status:        'new',
  }

  // Only include optional fields that have a truthy value to avoid storing nulls
  if (row.first_name)   record.first_name   = row.first_name
  if (row.last_name)    record.last_name    = row.last_name
  if (row.phone)        record.phone        = row.phone
  if (row.title)        record.title        = row.title
  if (row.company)      record.company      = row.company
  if (row.website)      record.website      = row.website
  if (row.linkedin_url) record.linkedin_url = row.linkedin_url

  return record
}

/**
 * Convert a ValidatedRow into a DB update record (for 'update' mode).
 */
export function buildLeadUpdate(
  row: ValidatedRow,
  existingId: string
): LeadUpdate {
  const record: LeadUpdate = {
    id:         existingId,
    updated_at: new Date().toISOString(),
  }

  // Only update fields that are present in this import row
  if (row.first_name)    record.first_name    = row.first_name
  if (row.last_name)     record.last_name     = row.last_name
  if (row.phone)         record.phone         = row.phone
  if (row.title)         record.title         = row.title
  if (row.company)       record.company       = row.company
  if (row.website)       record.website       = row.website
  if (row.linkedin_url)  record.linkedin_url  = row.linkedin_url
  if (row.custom_fields && Object.keys(row.custom_fields).length > 0) {
    record.custom_fields = row.custom_fields
  }

  return record
}

// ── Batch insert ───────────────────────────────────────────────────────────
/**
 * Insert new leads in chunks of INSERT_CHUNK_SIZE.
 * Each chunk is attempted once; on failure it's retried once more.
 * If the retry also fails, all rows in that chunk are added to errors.
 *
 * This is intentionally NOT wrapped in a transaction across chunks so that
 * a failure in chunk N doesn't roll back chunks 0..N-1 (partial success
 * is better than all-or-nothing for large imports).
 */
export async function insertLeadsChunked(
  rows: LeadInsert[],
  supabase: SupabaseClient
): Promise<InsertResult> {
  let inserted = 0
  const errors: InsertResult['errors'] = []

  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE)

    const attempt = async () =>
      supabase.from('leads').insert(chunk as never[])

    let { error } = await attempt()

    if (error) {
      // Single retry after short delay
      await sleep(500)
      ;({ error } = await attempt())
    }

    if (error) {
      // Chunk failed after retry — log each row as an error
      console.error('[inserter] chunk insert failed:', error.message)
      for (const lead of chunk) {
        errors.push({ email: lead.email, reason: error.message })
      }
    } else {
      inserted += chunk.length
    }
  }

  return { inserted, updated: 0, errors }
}

// ── Batch update (duplicate mode = 'update') ───────────────────────────────
/**
 * Update existing leads individually (no bulk upsert to preserve other fields).
 * Updates are done in chunks; errors are collected without aborting.
 */
export async function updateLeadsChunked(
  rows: LeadUpdate[],
  supabase: SupabaseClient
): Promise<InsertResult> {
  let updated = 0
  const errors: InsertResult['errors'] = []

  // Updates must be per-row since each has a unique ID
  // Group into promises in batches to limit concurrency
  const CONCURRENCY = 20

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map(({ id, ...fields }) =>
        supabase
          .from('leads')
          .update(fields as never)
          .eq('id', id)
      )
    )

    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      if (r.status === 'fulfilled' && r.value.error) {
        errors.push({ email: batch[j].id, reason: r.value.error.message })
      } else if (r.status === 'rejected') {
        errors.push({ email: batch[j].id, reason: String(r.reason) })
      } else {
        updated++
      }
    }
  }

  return { inserted: 0, updated, errors }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
