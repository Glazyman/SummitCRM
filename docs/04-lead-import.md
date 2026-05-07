# 04 — Lead Import

## Goal
Allow users to bulk-import leads from a CSV file with a field-mapping UI, validation, deduplication, and batch assignment.

---

## Features

- CSV file upload (up to 10,000 rows per import)
- Field mapping UI: map CSV columns to CRM fields
- Required field validation (`email` is required)
- Email format validation
- Duplicate detection (by email within workspace)
- Assign all imported leads to a new or existing batch
- Import progress feedback (async processing)
- Import history log
- Download error report for failed rows
- Supports custom fields (stored in `custom_fields` JSONB)

---

## Database Tables

Refer to `03-database-schema.md` for full DDL.

**Primary tables**:
- `leads` — rows inserted per valid lead
- `lead_batches` — optional batch to assign imported leads
- `lead_imports` — tracks import job metadata and status

**Key fields on `lead_imports`**:
```
status:        processing | complete | failed
total_rows:    total CSV rows parsed
imported_rows: successfully created
failed_rows:   skipped (validation errors / duplicates)
field_mapping: { "CSV Column": "crm_field" } JSON
error_log:     [ { row: 5, email: "...", reason: "..." } ]
storage_path:  Supabase Storage path of the uploaded CSV
```

---

## API Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/leads/import/upload` | Get presigned upload URL for CSV | rep+ |
| POST | `/api/leads/import/start` | Start import job (field mapping + options) | rep+ |
| GET | `/api/leads/import/[id]` | Poll import job status | rep+ |
| GET | `/api/leads/import/[id]/errors` | Download error report | rep+ |
| GET | `/api/leads/imports` | List past imports | rep+ |

### `/api/leads/import/upload`
```ts
// Returns a Supabase Storage presigned URL for the client to upload directly
// Stores file under: lead-imports/{workspace_id}/{import_id}.csv
Response: { uploadUrl: string, importId: string }
```

### `/api/leads/import/start`
```ts
Request: {
  importId: string,
  fieldMapping: Record<string, string>,  // { csvColumn: crmField }
  batchId?: string,
  newBatchName?: string,
  skipDuplicates: boolean
}
Response: { jobId: string }
```

---

## Processing Flow (Edge Function)

The heavy work happens in a Supabase Edge Function `process-lead-import`:

```
1. Download CSV from Supabase Storage
2. Parse rows (skip header)
3. For each row:
   a. Apply field mapping
   b. Validate required fields (email present, valid format)
   c. Check for duplicate email in workspace (SELECT COUNT)
   d. If valid: INSERT into leads
   e. If invalid: log to error_log array
4. Create/assign lead_batch if requested
5. Update lead_imports row: status, counts, error_log
6. Log activity: 'lead_imported' with count metadata
7. Send notification to importing user
```

**Error handling**:
- Parse errors (malformed CSV): mark import as `failed` immediately
- Row-level errors: continue processing, collect in `error_log`
- DB errors: retry up to 3 times, then mark as `failed`

---

## Supabase Storage Configuration

```
Bucket: lead-imports
Access: private (only via signed URLs)
Policy: workspace members with rep+ role can upload to their workspace prefix
File retention: 30 days (auto-expire policy)
Max file size: 25 MB
```

---

## Field Mapping

### Standard CRM Fields Available for Mapping

| CRM Field | Required | Notes |
|---|---|---|
| `email` | YES | Must be valid email format |
| `first_name` | no | |
| `last_name` | no | |
| `phone` | no | |
| `title` | no | Job title |
| `company` | no | |
| `website` | no | |
| `linkedin_url` | no | |
| `source` | no | Defaults to `csv_import` |
| `status` | no | Defaults to `new` |
| `custom:*` | no | Any remaining columns → custom_fields JSONB |

### Field Mapping UI Behaviour
- Parse first row of CSV to detect column headers
- Show each CSV column as a row with a dropdown to select CRM field
- Auto-suggest mapping based on fuzzy name matching (e.g., "First Name" → `first_name`)
- Allow unmapped columns to be ignored or stored as custom fields
- Show preview of first 3 data rows

---

## UI Components

### `<ImportWizard>` — Multi-step wizard
**Step 1: Upload**
- Drag & drop zone or file picker
- Accepts `.csv` only
- Shows file name + row count preview after parse

**Step 2: Field Mapping**
- Table: CSV column | Sample value | Map to (dropdown)
- CRM field options list
- "Store as custom field" option
- Validation feedback inline

**Step 3: Options**
- Assign to batch: dropdown (existing batches) + "Create new batch" input
- Duplicate handling: Skip / Update existing
- Confirm button

**Step 4: Progress**
- Progress bar (polling `/api/leads/import/[id]` every 2s)
- "X leads imported successfully"
- "Y rows failed" + download error report link
- "View Leads" CTA button

### `<ImportHistoryTable>`
- Columns: Date, File, Imported, Failed, Batch, Status
- Link to re-download error report

---

## Implementation Order

1. Create `lead_imports` and `lead_batches` tables + migrations
2. Create Supabase Storage bucket `lead-imports` with policies
3. Build `/api/leads/import/upload` — presigned URL generation
4. Build CSV preview parser (client-side, `papaparse` library)
5. Build `<ImportWizard>` Step 1 + 2 (upload + field mapping)
6. Build `/api/leads/import/start` — create `lead_imports` row, trigger Edge Function
7. Build Supabase Edge Function `process-lead-import`
8. Build `/api/leads/import/[id]` polling endpoint
9. Build Step 3 + 4 of wizard (options + progress)
10. Build `<ImportHistoryTable>` component and page

---

## Libraries

| Library | Purpose |
|---|---|
| `papaparse` | Client-side CSV parsing for preview and header detection |
| `@supabase/storage-js` | Presigned URL upload |
| `zod` | Row validation schema |

---

## Testing Checklist

- [ ] CSV with 10,000 rows imports without timeout
- [ ] Invalid email rows are rejected and logged
- [ ] Duplicate emails are skipped (not double-imported)
- [ ] Field mapping correctly maps CSV columns to DB fields
- [ ] Custom fields are stored in JSONB
- [ ] Import assigns leads to correct batch
- [ ] Error report download contains failed rows with reasons
- [ ] Import history shows correct counts
- [ ] RLS: user cannot trigger an import for another workspace
- [ ] File upload is rejected if over 25 MB
- [ ] Import status polling updates in real-time

---

## AI Model Guidance

- **No AI needed** for import logic itself.
- **GPT-4o-mini** can optionally suggest field mappings by comparing CSV column names against CRM field names (a small classification task, cheap at scale).
- Use Claude Sonnet only if building a "smart import" feature that infers custom field meanings from sample data.
