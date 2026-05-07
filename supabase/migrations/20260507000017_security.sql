-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 017: Security — app_secrets table + data retention cron jobs
-- ═══════════════════════════════════════════════════════════════════════════

-- ── app_secrets (dev-mode vault fallback) ─────────────────────────────────
-- Used when SUPABASE_VAULT_ENABLED !== 'true' (local dev / CI).
-- In production, Supabase Vault is used and this table is never touched.
-- The ciphertext column holds AES-256-GCM encrypted blobs (iv:tag:enc hex).
-- Access is ONLY via service-role (admin client) — no RLS SELECT policy.

CREATE TABLE IF NOT EXISTS app_secrets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  ciphertext  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- No SELECT / INSERT / UPDATE / DELETE policies for any authenticated role.
-- Only the service role (bypasses RLS) can read or write secrets.
-- This ensures that even if an API key is leaked, secret values are inaccessible.

COMMENT ON TABLE app_secrets IS
  'Dev-mode encrypted credential store. In production use Supabase Vault.';

-- ── audit_logs ────────────────────────────────────────────────────────────
-- Ensure the table exists (may have been created earlier); add index.
CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action        text        NOT NULL,
  resource_type text,
  resource_id   uuid,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace
  ON audit_logs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON audit_logs (actor_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins and super_admins can read audit logs; no one can write or delete via app.
DO $$ BEGIN
  CREATE POLICY "audit_logs_admin_read" ON audit_logs
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM workspace_members
        WHERE workspace_id = audit_logs.workspace_id
          AND user_id = auth.uid()
          AND role IN ('admin', 'super_admin')
          AND is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE audit_logs IS
  'Immutable security audit log. Service-role INSERT only; no client write/delete.';

-- ── Data retention cron jobs ──────────────────────────────────────────────

-- Hard-delete soft-deleted leads older than 90 days
SELECT cron.schedule(
  'purge-deleted-leads',
  '0 3 * * *',   -- 3am UTC daily
  $$
  DELETE FROM leads
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - INTERVAL '90 days'
  $$
) ON CONFLICT DO NOTHING;

-- Hard-delete lead import CSV files from storage older than 30 days
-- (The actual storage objects must be deleted via Supabase Storage API in an Edge Function;
--  this cleans the lead_imports metadata records)
SELECT cron.schedule(
  'cleanup-old-imports',
  '30 3 * * *',  -- 3:30am UTC daily
  $$
  DELETE FROM lead_imports
  WHERE created_at < now() - INTERVAL '30 days'
    AND status IN ('completed', 'failed', 'cancelled')
  $$
) ON CONFLICT DO NOTHING;

-- ── GDPR: unsubscribes dedup index ───────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribes_workspace_email
  ON unsubscribes (workspace_id, email);
