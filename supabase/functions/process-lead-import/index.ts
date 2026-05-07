/**
 * Supabase Edge Function: process-lead-import
 *
 * Handles async lead import processing for large files (> 5 000 rows).
 * Triggered by the Next.js API route POST /api/leads/import/queue.
 *
 * Flow:
 *   1. Fetch lead_imports record (has field_mapping + storage_path)
 *   2. Download raw file from Supabase Storage
 *   3. Parse CSV or XLSX
 *   4. Apply field mapping
 *   5. Validate rows (Zod-style inline checks)
 *   6. Intra-file dedup
 *   7. DB-level bulk dedup (chunked IN queries)
 *   8. Create / resolve batch
 *   9. Chunked insert / update
 *  10. Final update to lead_imports + activity log
 *
 * This is self-contained Deno code — it does not import from lib/import/.
 * The same logic mirrors processor.ts but runs inside the Supabase runtime.
 *
 * Authentication: The request must include a valid service-role JWT
 * (set automatically when called via supabase.functions.invoke on the server).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient }  from 'npm:@supabase/supabase-js@2'
import Papa              from 'npm:papaparse@5'
import * as XLSX         from 'npm:xlsx@0.18.5'

// ── Config ─────────────────────────────────────────────────────────────────
const INSERT_CHUNK_SIZE = 500
const DEDUP_CHUNK_SIZE  = 500
const CONCURRENCY       = 20

// ── Main handler ───────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { importId, batchId, newBatchName, duplicateMode } = body as {
    importId:      string
    batchId:       string | null
    newBatchName:  string
    duplicateMode: 'skip' | 'update'
  }

  if (!importId) return json({ error: 'importId is required' }, 400)

  // ── Supabase admin client (service role) ──────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ── Fetch import record ─────────────────────────────────────────────
  const { data: importRecord, error: fetchErr } = await supabase
    .from('lead_imports')
    .select('id, workspace_id, imported_by, field_mapping, storage_path, status')
    .eq('id', importId)
    .single()

  if (fetchErr || !importRecord) {
    return json({ error: 'Import record not found' }, 404)
  }

  if (importRecord.status === 'complete') {
    return json({ error: 'Import already complete' }, 409)
  }

  const { workspace_id: workspaceId, imported_by: userId, field_mapping: fieldMapping, storage_path: storagePath } = importRecord

  // Mark as processing
  await supabase
    .from('lead_imports')
    .update({ status: 'processing' })
    .eq('id', importId)

  try {
    // ── Download file from Storage ──────────────────────────────────
    if (!storagePath) throw new Error('No storage_path on import record')

    const { data: fileData, error: dlErr } = await supabase.storage
      .from('lead-imports')
      .download(storagePath)

    if (dlErr || !fileData) throw new Error(`Storage download failed: ${dlErr?.message}`)

    // ── Parse file ─────────────────────────────────────────────────
    const isXlsx = storagePath.endsWith('.xlsx') || storagePath.endsWith('.xls')
    let rows: Record<string, string>[]

    if (isXlsx) {
      rows = await parseXlsx(fileData)
    } else {
      rows = await parseCsv(fileData)
    }

    if (rows.length === 0) throw new Error('File contains no data rows')
    if (rows.length > 10_000) throw new Error('File exceeds 10 000 row limit')

    // Update total_rows now that we know
    await supabase
      .from('lead_imports')
      .update({ total_rows: rows.length })
      .eq('id', importId)

    // ── Apply field mapping ─────────────────────────────────────────
    const mapped = rows.map((row) => applyMapping(row, fieldMapping as Record<string, string>))

    // ── Validate rows ───────────────────────────────────────────────
    const { valid, errors: validationErrors } = validateRows(mapped)

    // ── Intra-file dedup ────────────────────────────────────────────
    const { unique, duplicates: intraFileDuplicates } = deduplicateWithinFile(valid)

    // ── DB-level dedup ──────────────────────────────────────────────
    const emails = unique.map((r) => r.email)
    const mode   = (duplicateMode ?? 'skip') as 'skip' | 'update'
    const { existingEmails, emailToId } = await detectDuplicates(workspaceId, emails, mode, supabase)

    // ── Partition rows ──────────────────────────────────────────────
    const toInsert: typeof valid  = []
    const toUpdate: Array<typeof valid[0] & { existingId: string }> = []
    const dbSkipped: ErrorEntry[] = []

    for (let i = 0; i < unique.length; i++) {
      const row = unique[i]
      const key = row.email.toLowerCase()
      if (existingEmails.has(key)) {
        if (mode === 'update' && emailToId.has(key)) {
          toUpdate.push({ ...row, existingId: emailToId.get(key)! })
        } else {
          dbSkipped.push({ row: i + 1, email: row.email, reason: 'Duplicate: email already exists in workspace' })
        }
      } else {
        toInsert.push(row)
      }
    }

    // ── Resolve / create batch ──────────────────────────────────────
    let resolvedBatchId:   string | null = batchId ?? null
    let resolvedBatchName: string        = newBatchName ?? ''

    if (!resolvedBatchId && resolvedBatchName.trim()) {
      const { data: nb, error: nbErr } = await supabase
        .from('lead_batches')
        .insert({ workspace_id: workspaceId, created_by: userId, name: resolvedBatchName.trim() })
        .select('id, name')
        .single()

      if (nbErr || !nb) throw new Error(`Failed to create batch: ${nbErr?.message}`)
      resolvedBatchId   = nb.id
      resolvedBatchName = nb.name
    }

    // ── Insert leads ────────────────────────────────────────────────
    const insertRecords = toInsert.map((row) => ({
      workspace_id:  workspaceId,
      import_id:     importId,
      batch_id:      resolvedBatchId,
      assigned_to:   null,
      email:         row.email,
      first_name:    row.first_name,
      last_name:     row.last_name,
      phone:         row.phone,
      title:         row.title,
      company:       row.company,
      website:       row.website,
      linkedin_url:  row.linkedin_url,
      custom_fields: row.custom_fields ?? {},
      source:        'csv_import',
      status:        'new',
    }))

    const { inserted, insertErrors } = await insertChunked(insertRecords, supabase)

    // ── Update leads ────────────────────────────────────────────────
    let updated = 0
    const updateErrors: ErrorEntry[] = []

    for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
      const batch = toUpdate.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(({ existingId, ...fields }) =>
          supabase
            .from('leads')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', existingId)
        )
      )
      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled' && !r.value.error) {
          updated++
        } else {
          const reason = r.status === 'rejected' ? String(r.reason) : r.value.error?.message ?? 'Update failed'
          updateErrors.push({ row: i + j + 1, email: batch[j].email, reason })
        }
      }
    }

    // ── Collect all errors ──────────────────────────────────────────
    const allErrors: ErrorEntry[] = [
      ...validationErrors,
      ...intraFileDuplicates,
      ...dbSkipped,
      ...insertErrors,
      ...updateErrors,
    ]

    const failed  = allErrors.filter((e) => !e.reason.startsWith('Duplicate')).length
    const skipped = allErrors.filter((e) =>  e.reason.startsWith('Duplicate')).length

    // ── Update import record ────────────────────────────────────────
    await supabase
      .from('lead_imports')
      .update({
        status:        'complete',
        imported_rows: inserted + updated,
        failed_rows:   failed + skipped,
        error_log:     allErrors.slice(0, 1000),
      })
      .eq('id', importId)

    // ── Log activity ────────────────────────────────────────────────
    if (inserted + updated > 0) {
      await supabase.from('activity_logs').insert({
        workspace_id:  workspaceId,
        user_id:       userId,
        activity_type: 'lead_imported',
        metadata: {
          import_id:  importId,
          batch_id:   resolvedBatchId,
          batch_name: resolvedBatchName,
          inserted,
          updated,
          skipped,
          failed,
        },
      })
    }

    return json({ importId, inserted, updated, skipped, failed, total: rows.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[process-lead-import] fatal error:', message)

    await supabase
      .from('lead_imports')
      .update({
        status:    'failed',
        error_log: [{ row: 0, email: '', reason: message }],
      })
      .eq('id', importId)

    return json({ error: message }, 500)
  }
})

// ── Parsers ────────────────────────────────────────────────────────────────
async function parseCsv(blob: Blob): Promise<Record<string, string>[]> {
  const text = await blob.text()
  const result = Papa.parse<Record<string, string>>(text, {
    header:         true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
    transform:       (v: string) => v.trim(),
  })
  return result.data
}

async function parseXlsx(blob: Blob): Promise<Record<string, string>[]> {
  const buf   = await blob.arrayBuffer()
  const wb    = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: '',
    raw:    false,
  })
}

// ── Field mapping ─────────────────────────────────────────────────────────
function applyMapping(
  rawRow: Record<string, string>,
  mapping: Record<string, string>
): MappedRow {
  const result: Record<string, any> = {}
  const custom: Record<string, string> = {}

  for (const [col, field] of Object.entries(mapping)) {
    if (field === 'ignore') continue
    const val = rawRow[col]?.trim() ?? ''
    if (!val) continue
    if (field === 'custom') {
      custom[col.toLowerCase().replace(/\s+/g, '_')] = val
    } else {
      result[field] = val
    }
  }

  if (Object.keys(custom).length > 0) result.custom_fields = custom
  return result as MappedRow
}

// ── Validation ────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateRows(rows: MappedRow[]): { valid: ValidRow[]; errors: ErrorEntry[] } {
  const valid: ValidRow[]   = []
  const errors: ErrorEntry[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1

    const email = (row.email ?? '').trim().toLowerCase()

    if (!email) {
      errors.push({ row: rowNum, email: '', reason: 'Email is required' })
      continue
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({ row: rowNum, email, reason: 'Invalid email format' })
      continue
    }
    if (email.length > 254) {
      errors.push({ row: rowNum, email, reason: 'Email exceeds maximum length' })
      continue
    }

    valid.push({ ...row, email })
  }

  return { valid, errors }
}

// ── Deduplication ─────────────────────────────────────────────────────────
function deduplicateWithinFile(rows: ValidRow[]): { unique: ValidRow[]; duplicates: ErrorEntry[] } {
  const seen = new Map<string, number>()
  const unique: ValidRow[]     = []
  const duplicates: ErrorEntry[] = []

  for (let i = 0; i < rows.length; i++) {
    const email = rows[i].email.toLowerCase()
    if (seen.has(email)) {
      duplicates.push({ row: i + 1, email: rows[i].email, reason: `Duplicate within file (first seen row ${seen.get(email)! + 1})` })
    } else {
      seen.set(email, i)
      unique.push(rows[i])
    }
  }

  return { unique, duplicates }
}

async function detectDuplicates(
  workspaceId: string,
  emails: string[],
  mode: 'skip' | 'update',
  supabase: ReturnType<typeof createClient>
): Promise<{ existingEmails: Set<string>; emailToId: Map<string, string> }> {
  const existingEmails = new Set<string>()
  const emailToId      = new Map<string, string>()
  const lower          = emails.map((e) => e.toLowerCase())

  for (let i = 0; i < lower.length; i += DEDUP_CHUNK_SIZE) {
    const chunk = lower.slice(i, i + DEDUP_CHUNK_SIZE)
    const { data } = await supabase
      .from('leads')
      .select(mode === 'update' ? 'id, email' : 'email')
      .eq('workspace_id', workspaceId)
      .in('email', chunk)
      .is('deleted_at', null)

    for (const row of (data ?? []) as Array<{ email: string; id?: string }>) {
      existingEmails.add(row.email.toLowerCase())
      if (mode === 'update' && row.id) emailToId.set(row.email.toLowerCase(), row.id)
    }
  }

  return { existingEmails, emailToId }
}

// ── Insert ────────────────────────────────────────────────────────────────
async function insertChunked(
  rows: Record<string, any>[],
  supabase: ReturnType<typeof createClient>
): Promise<{ inserted: number; insertErrors: ErrorEntry[] }> {
  let inserted = 0
  const insertErrors: ErrorEntry[] = []

  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE)
    let { error } = await supabase.from('leads').insert(chunk)

    if (error) {
      await new Promise((r) => setTimeout(r, 500))
      ;({ error } = await supabase.from('leads').insert(chunk))
    }

    if (error) {
      for (const r of chunk) {
        insertErrors.push({ row: 0, email: r.email, reason: error.message })
      }
    } else {
      inserted += chunk.length
    }
  }

  return { inserted, insertErrors }
}

// ── Utilities ──────────────────────────────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Local types ────────────────────────────────────────────────────────────
interface MappedRow {
  email?:         string
  first_name?:    string
  last_name?:     string
  phone?:         string
  title?:         string
  company?:       string
  website?:       string
  linkedin_url?:  string
  custom_fields?: Record<string, string>
}

interface ValidRow extends MappedRow {
  email: string
}

interface ErrorEntry {
  row:    number
  email:  string
  reason: string
}
