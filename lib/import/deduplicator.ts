/**
 * lib/import/deduplicator.ts
 *
 * Bulk duplicate detection — single query per chunk instead of N queries.
 * Handles two duplicate modes:
 *   'skip'   → return set of existing emails to exclude from insert
 *   'update' → return map of email → lead_id for upsert
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEDUP_CHUNK_SIZE } from './validator'

// ── Types ─────────────────────────────────────────────────────────────────
export interface DedupResult {
  /** Emails that already exist in this workspace */
  existingEmails: Set<string>
  /** email → lead_id map (only populated when mode = 'update') */
  emailToId: Map<string, string>
  /** Number of rows flagged as duplicates */
  duplicateCount: number
}

export interface DedupError {
  row: number
  email: string
  reason: string
}

// ── Core deduplication ─────────────────────────────────────────────────────
/**
 * Bulk check a list of emails against the leads table for a workspace.
 *
 * Uses chunked IN queries (DEDUP_CHUNK_SIZE per query) to avoid Postgres
 * query size limits when checking thousands of emails at once.
 *
 * @param workspaceId   The workspace to scope the search to
 * @param emails        Raw email strings (will be lowercased internally)
 * @param mode          'skip' = just find existing; 'update' = also fetch IDs
 * @param supabase      Supabase client (admin or RLS-bypassed)
 */
export async function detectDuplicates(
  workspaceId: string,
  emails: string[],
  mode: 'skip' | 'update',
  supabase: SupabaseClient
): Promise<DedupResult> {
  const normalised = emails.map((e) => e.toLowerCase().trim())
  const existingEmails = new Set<string>()
  const emailToId      = new Map<string, string>()

  for (let i = 0; i < normalised.length; i += DEDUP_CHUNK_SIZE) {
    const chunk = normalised.slice(i, i + DEDUP_CHUNK_SIZE)

    const query = supabase
      .from('leads')
      .select(mode === 'update' ? 'id, email' : 'email')
      .eq('workspace_id', workspaceId)
      .in('email', chunk)
      .is('deleted_at', null) // respect soft deletes

    const { data: rows, error } = await query

    if (error) {
      console.error('[deduplicator] chunk query failed:', error.message)
      // On error: treat as no duplicates for this chunk to avoid blocking the import.
      // Downstream unique constraint will catch actual duplicates.
      continue
    }

    for (const row of (rows ?? []) as unknown as Array<{ email: string; id?: string }>) {
      const email = row.email.toLowerCase()
      existingEmails.add(email)
      if (mode === 'update' && row.id) {
        emailToId.set(email, row.id)
      }
    }
  }

  return {
    existingEmails,
    emailToId,
    duplicateCount: existingEmails.size,
  }
}

// ── Row splitting ─────────────────────────────────────────────────────────
/**
 * Partition validated rows into two groups:
 *   - `toInsert`  : rows whose email is NOT in existingEmails
 *   - `toUpdate`  : rows whose email IS in existingEmails (for 'update' mode)
 *   - `skipped`   : rows whose email IS in existingEmails (for 'skip' mode)
 * Also collects per-row DedupError entries for skipped rows.
 */
export function partitionRows<T extends { email?: string | null }>(
  rows: T[],
  dedup: DedupResult,
  mode: 'skip' | 'update'
): {
  toInsert: T[]
  toUpdate: Array<T & { existingId: string }>
  skipped: DedupError[]
} {
  const toInsert: T[] = []
  const toUpdate: Array<T & { existingId: string }> = []
  const skipped: DedupError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    // No email → always insert (can't dedup without one)
    if (!row.email) {
      toInsert.push(row)
      continue
    }

    const emailKey = row.email.toLowerCase()

    if (dedup.existingEmails.has(emailKey)) {
      if (mode === 'update') {
        const existingId = dedup.emailToId.get(emailKey)
        if (existingId) {
          toUpdate.push({ ...row, existingId })
        } else {
          toInsert.push(row)
        }
      } else {
        skipped.push({
          row: i + 1,
          email: row.email,
          reason: 'Duplicate: email already exists in workspace',
        })
      }
    } else {
      toInsert.push(row)
    }
  }

  return { toInsert, toUpdate, skipped }
}

/**
 * Within a single import batch: detect rows that are duplicates of each other
 * (same email appearing more than once in the file itself).
 *
 * Returns the list of rows after removing intra-file duplicates,
 * plus errors for the removed rows.
 */
export function deduplicateWithinFile<T extends { email?: string | null }>(
  rows: T[]
): { unique: T[]; duplicates: DedupError[] } {
  const seen = new Map<string, number>() // email → first row index
  const unique: T[] = []
  const duplicates: DedupError[] = []

  for (let i = 0; i < rows.length; i++) {
    const rawEmail = rows[i].email
    // Rows without email are always unique (no basis for dedup)
    if (!rawEmail) {
      unique.push(rows[i])
      continue
    }
    const email = rawEmail.toLowerCase()
    if (seen.has(email)) {
      duplicates.push({
        row: i + 1,
        email: rawEmail,
        reason: `Duplicate within file: same email as row ${(seen.get(email)! + 1)}`,
      })
    } else {
      seen.set(email, i)
      unique.push(rows[i])
    }
  }

  return { unique, duplicates }
}
