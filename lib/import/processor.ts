/**
 * lib/import/processor.ts
 *
 * Main orchestrator for a lead import job.
 *
 * Flow:
 *   1. Create/resolve batch
 *   2. Validate all mapped rows
 *   3. Bulk dedup (check existing emails in workspace)
 *   4. Intra-file dedup (same email twice in the file)
 *   5. Partition into insert vs update vs skip
 *   6. Chunked DB insert / update
 *   7. Update lead_imports record with final status
 *   8. Log activity
 *
 * This function is called by the Next.js API route for synchronous imports.
 * The Supabase Edge Function calls the same logic for async large imports.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { validateRows, type ValidationResult }                       from './validator'
import { applyMappingToAll, type FieldMapping }                      from './mapper'
import { detectDuplicates, deduplicateWithinFile, partitionRows }    from './deduplicator'
import { buildLeadInsert, buildLeadUpdate,
         insertLeadsChunked, updateLeadsChunked }                    from './inserter'
import type { ValidatedRow }                                         from './validator'

// ── Types ─────────────────────────────────────────────────────────────────
export interface ProcessImportArgs {
  importId:       string
  workspaceId:    string
  userId:         string         // user who triggered the import
  rows:           Record<string, string>[]  // raw parsed rows (pre-client-parse)
  mapping:        FieldMapping
  batchId:        string | null  // existing batch, or null to create new
  newBatchName:   string         // used when batchId is null
  duplicateMode:  'skip' | 'update'
  supabase:       SupabaseClient // admin or service-role client (bypasses RLS)
}

export interface ProcessImportResult {
  importId:     string
  batchId:      string | null
  batchName:    string
  total:        number
  imported:     number
  updated:      number
  skipped:      number
  failed:       number
  errors:       Array<{ row: number; email: string; reason: string }>
}

// ── Orchestrator ──────────────────────────────────────────────────────────
export async function processImport(
  args: ProcessImportArgs
): Promise<ProcessImportResult> {
  const {
    importId, workspaceId, userId, rows,
    mapping, batchId, newBatchName,
    duplicateMode, supabase,
  } = args

  // Mark import as processing
  await supabase
    .from('lead_imports')
    .update({ status: 'processing', total_rows: rows.length } as never)
    .eq('id', importId)

  let resolvedBatchId: string | null = batchId
  let resolvedBatchName: string = newBatchName

  try {
    // ── Step 1: Resolve or create batch ─────────────────────────────────
    if (!batchId && newBatchName.trim()) {
      const { data: newBatch, error: batchErr } = await supabase
        .from('lead_batches')
        .insert({
          workspace_id: workspaceId,
          created_by:   userId,
          name:         newBatchName.trim(),
        } as never)
        .select('id, name')
        .single() as { data: { id: string; name: string } | null; error: unknown }

      if (batchErr || !newBatch) {
        throw new Error(`Failed to create batch: ${String(batchErr)}`)
      }

      resolvedBatchId   = newBatch.id
      resolvedBatchName = newBatch.name
    } else if (batchId) {
      const { data: existingBatch } = await supabase
        .from('lead_batches')
        .select('id, name')
        .eq('id', batchId)
        .eq('workspace_id', workspaceId)
        .single() as { data: { id: string; name: string } | null; error: unknown }

      resolvedBatchName = existingBatch?.name ?? 'Unnamed Batch'
    }

    // ── Step 2: Apply field mapping ──────────────────────────────────────
    const mappedRows = applyMappingToAll(rows, mapping)

    // ── Step 3: Validate rows ─────────────────────────────────────────────
    const { valid, errors: validationErrors }: ValidationResult = validateRows(mappedRows)

    // ── Step 4: Intra-file dedup ──────────────────────────────────────────
    const { unique: uniqueRows, duplicates: intraFileDuplicates } =
      deduplicateWithinFile(valid)

    // ── Step 5: DB-level dedup ────────────────────────────────────────────
    const emails = uniqueRows.map((r) => r.email)
    const dedupResult = await detectDuplicates(
      workspaceId,
      emails,
      duplicateMode,
      supabase
    )

    const { toInsert, toUpdate, skipped: dbSkipped } =
      partitionRows(uniqueRows, dedupResult, duplicateMode)

    // ── Step 6: Build insert/update records ───────────────────────────────
    const insertRecords = toInsert.map((row) =>
      buildLeadInsert(row, {
        workspaceId,
        importId,
        batchId: resolvedBatchId,
        assignedTo: null, // batch assignment is at batch level
      })
    )

    const updateRecords = toUpdate.map(({ existingId, ...row }) =>
      buildLeadUpdate(row as ValidatedRow, existingId)
    )

    // ── Step 7: DB writes ─────────────────────────────────────────────────
    const [insertResult, updateResult] = await Promise.all([
      insertRecords.length > 0
        ? insertLeadsChunked(insertRecords, supabase)
        : Promise.resolve({ inserted: 0, updated: 0, errors: [] }),
      updateRecords.length > 0
        ? updateLeadsChunked(updateRecords, supabase)
        : Promise.resolve({ inserted: 0, updated: 0, errors: [] }),
    ])

    // ── Step 8: Collect all errors ─────────────────────────────────────────
    const allErrors = [
      ...validationErrors,
      ...intraFileDuplicates,
      ...dbSkipped,
      ...insertResult.errors.map((e, i) => ({
        row: i + 1,
        email: e.email,
        reason: e.reason,
      })),
      ...updateResult.errors.map((e, i) => ({
        row: i + 1,
        email: e.email,
        reason: e.reason,
      })),
    ]

    const imported = insertResult.inserted
    const updated  = updateResult.updated
    const failed   = insertResult.errors.length + updateResult.errors.length + validationErrors.length
    const skipped  = dbSkipped.length + intraFileDuplicates.length

    // ── Step 9: Update import record ──────────────────────────────────────
    await supabase
      .from('lead_imports')
      .update({
        status:        'complete',
        imported_rows: imported + updated,
        failed_rows:   failed + skipped,
        error_log:     allErrors.slice(0, 1000), // cap stored errors at 1 000
      } as never)
      .eq('id', importId)

    // ── Step 10: Log activity ─────────────────────────────────────────────
    if (imported + updated > 0) {
      await supabase.from('activity_logs').insert({
        workspace_id:  workspaceId,
        user_id:       userId,
        type:          'lead_imported',
        metadata: {
          import_id:   importId,
          batch_id:    resolvedBatchId,
          batch_name:  resolvedBatchName,
          imported,
          updated,
          skipped,
          failed,
        },
      } as never)
    }

    return {
      importId,
      batchId:    resolvedBatchId,
      batchName:  resolvedBatchName,
      total:      rows.length,
      imported,
      updated,
      skipped,
      failed,
      errors:     allErrors,
    }
  } catch (err) {
    // Mark import as failed
    const message = err instanceof Error ? err.message : String(err)
    console.error('[processor] import failed:', message)

    await supabase
      .from('lead_imports')
      .update({
        status:     'failed',
        error_log:  [{ row: 0, email: '', reason: message }],
      } as never)
      .eq('id', importId)

    throw err
  }
}
