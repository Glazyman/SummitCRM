-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 004: Lead Tables
-- lead_batches, lead_imports, leads, notes.
-- Order matters: lead_batches and lead_imports before leads (FK deps).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── lead_batches ──────────────────────────────────────────────────────────
-- Logical groupings of leads (e.g. "Q2 SaaS Founders", "Inbound Mar 2026")
CREATE TABLE lead_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL                 CHECK (char_length(name) BETWEEN 1 AND 150),
  description   text                          CHECK (char_length(description) <= 1000),
  created_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Denormalized count maintained by trigger — avoids COUNT(*) on every list render
  lead_count    integer NOT NULL DEFAULT 0    CHECK (lead_count >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lead_batches IS 'Named groups of leads for campaign targeting and organisation.';
COMMENT ON COLUMN lead_batches.lead_count IS 'Denormalized: updated by trigger on leads INSERT/DELETE.';

CREATE INDEX idx_lead_batches_workspace ON lead_batches (workspace_id);

-- ── lead_imports ──────────────────────────────────────────────────────────
-- Tracks each CSV import job: file, field mapping, progress, errors.
CREATE TABLE lead_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  file_name       text NOT NULL               CHECK (char_length(file_name) <= 255),
  -- Path inside Supabase Storage bucket "lead-imports"
  storage_path    text NOT NULL,
  batch_id        uuid REFERENCES lead_batches(id) ON DELETE SET NULL,
  total_rows      integer                     CHECK (total_rows >= 0),
  imported_rows   integer                     CHECK (imported_rows >= 0),
  failed_rows     integer                     CHECK (failed_rows >= 0),
  -- { "CSV Column": "crm_field" } mapping chosen by user
  field_mapping   jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'complete', 'failed')),
  -- Array of { row, email, reason } objects for failed rows
  error_log       jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

COMMENT ON TABLE lead_imports IS 'One row per CSV import job. Tracks async processing state.';

CREATE INDEX idx_lead_imports_workspace ON lead_imports (workspace_id);
CREATE INDEX idx_lead_imports_status    ON lead_imports (workspace_id, status);

-- ── leads ─────────────────────────────────────────────────────────────────
-- Core entity: one row per prospect / contact.
CREATE TABLE leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assigned_to     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  batch_id        uuid REFERENCES lead_batches(id) ON DELETE SET NULL,
  import_id       uuid REFERENCES lead_imports(id) ON DELETE SET NULL,

  -- ── Identity ──────────────────────────────────────────────────────────
  first_name      text                        CHECK (char_length(first_name) <= 100),
  last_name       text                        CHECK (char_length(last_name) <= 100),
  email           text NOT NULL               CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  phone           text                        CHECK (char_length(phone) <= 30),
  title           text                        CHECK (char_length(title) <= 200),
  company         text                        CHECK (char_length(company) <= 200),
  website         text                        CHECK (char_length(website) <= 500),
  linkedin_url    text                        CHECK (linkedin_url ~ '^https?://'),

  -- ── Status ────────────────────────────────────────────────────────────
  status          lead_status NOT NULL DEFAULT 'new',
  is_unsubscribed boolean NOT NULL DEFAULT false,
  unsubscribed_at timestamptz,

  -- ── Enrichment ────────────────────────────────────────────────────────
  -- Stores unmapped CSV columns and any custom fields
  custom_fields   jsonb NOT NULL DEFAULT '{}',
  -- AI-generated summary of this lead for context in prompts
  ai_summary      text                        CHECK (char_length(ai_summary) <= 2000),

  -- ── Metadata ──────────────────────────────────────────────────────────
  source          text NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual', 'csv_import', 'api', 'invite')),

  -- ── Soft delete ───────────────────────────────────────────────────────
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate emails per workspace (only among non-deleted leads)
  UNIQUE NULLS NOT DISTINCT (workspace_id, email)
    DEFERRABLE INITIALLY DEFERRED
);

-- NOTE: The UNIQUE on (workspace_id, email) uses DEFERRABLE so bulk imports
-- can be wrapped in a transaction that checks duplicates at COMMIT time.

COMMENT ON TABLE leads IS 'Core CRM entity. One row per prospect. Never hard-deleted (soft delete only).';
COMMENT ON COLUMN leads.custom_fields IS 'Unmapped CSV fields + user-defined custom attributes as key-value JSON.';
COMMENT ON COLUMN leads.source IS 'How this lead entered the system.';

-- Primary lookup index
CREATE INDEX idx_leads_workspace     ON leads (workspace_id)            WHERE deleted_at IS NULL;
-- Status filtering (most common dashboard filter)
CREATE INDEX idx_leads_status        ON leads (workspace_id, status)    WHERE deleted_at IS NULL;
-- Email dedup check + unsubscribe lookup
CREATE INDEX idx_leads_email         ON leads (workspace_id, lower(email)) WHERE deleted_at IS NULL;
-- Batch-level queries (campaign targeting)
CREATE INDEX idx_leads_batch         ON leads (batch_id)                WHERE deleted_at IS NULL;
-- Rep dashboard: "my leads"
CREATE INDEX idx_leads_assigned      ON leads (assigned_to, workspace_id) WHERE deleted_at IS NULL;
-- Full-text search across name + company
CREATE INDEX idx_leads_fts           ON leads USING gin (
  to_tsvector('english',
    coalesce(first_name, '') || ' ' ||
    coalesce(last_name, '') || ' ' ||
    coalesce(company, '') || ' ' ||
    coalesce(email, '')
  )
) WHERE deleted_at IS NULL;
-- Time-based queries (recently created, activity feed)
CREATE INDEX idx_leads_created       ON leads (workspace_id, created_at DESC) WHERE deleted_at IS NULL;

-- ── notes ─────────────────────────────────────────────────────────────────
-- Free-form text notes attached to a lead. Soft-deleted.
CREATE TABLE notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  content       text NOT NULL               CHECK (char_length(content) BETWEEN 1 AND 5000),
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE notes IS 'User-written notes per lead. Soft-deleted to preserve activity history.';

CREATE INDEX idx_notes_lead      ON notes (lead_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_author    ON notes (author_id)                WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_workspace ON notes (workspace_id)             WHERE deleted_at IS NULL;
