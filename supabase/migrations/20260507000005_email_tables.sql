-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005: Email Tables
-- sending_accounts, emails, email_queue.
-- SECURITY NOTE: sending_accounts has encrypted credential columns.
--   These columns are stored as Supabase Vault references (vault secret IDs),
--   NOT raw keys. They are NEVER returned to the client.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── sending_accounts ──────────────────────────────────────────────────────
-- Each row is one outbound email identity (Resend key or SMTP config).
-- A workspace can have many sending accounts.
CREATE TABLE sending_accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                      text NOT NULL           CHECK (char_length(name) BETWEEN 1 AND 100),
  from_email                text NOT NULL           CHECK (from_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  from_name                 text                    CHECK (char_length(from_name) <= 100),
  type                      sending_account_type NOT NULL,

  -- ── Resend credentials ────────────────────────────────────────────────
  -- Stores the Supabase Vault SECRET ID, not the raw API key.
  -- Decrypt via: SELECT vault.decrypt_secret(resend_api_key_vault_id)
  resend_api_key_vault_id   uuid,  -- references vault.secrets.id

  -- ── SMTP credentials ─────────────────────────────────────────────────
  smtp_host                 text                    CHECK (char_length(smtp_host) <= 255),
  smtp_port                 integer                 CHECK (smtp_port BETWEEN 1 AND 65535),
  smtp_user                 text                    CHECK (char_length(smtp_user) <= 255),
  -- Stores the Supabase Vault SECRET ID for SMTP password
  smtp_pass_vault_id        uuid,  -- references vault.secrets.id
  smtp_secure               boolean NOT NULL DEFAULT true,   -- TLS

  -- ── Daily sending quota ───────────────────────────────────────────────
  -- Hard limit: queue processor will never exceed this per UTC day.
  daily_limit               integer NOT NULL DEFAULT 50   CHECK (daily_limit BETWEEN 1 AND 10000),
  -- Incremented atomically on each successful send. Reset by pg_cron at midnight UTC.
  emails_sent_today         integer NOT NULL DEFAULT 0    CHECK (emails_sent_today >= 0),
  -- Date of last reset — used to detect stale quota that needs resetting
  quota_reset_at            date NOT NULL DEFAULT CURRENT_DATE,

  -- ── Health ────────────────────────────────────────────────────────────
  is_active                 boolean NOT NULL DEFAULT true,
  last_error                text,
  last_used_at              timestamptz,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  -- Enforce: if Resend, vault_id must be set; if SMTP, host/port/user must be set
  CONSTRAINT resend_requires_vault_id CHECK (
    type != 'resend' OR resend_api_key_vault_id IS NOT NULL
  ),
  CONSTRAINT smtp_requires_host CHECK (
    type != 'smtp' OR (smtp_host IS NOT NULL AND smtp_port IS NOT NULL AND smtp_user IS NOT NULL)
  )
);

COMMENT ON TABLE sending_accounts IS 'Outbound email identities. Credential fields store Vault secret IDs, never raw values.';
COMMENT ON COLUMN sending_accounts.resend_api_key_vault_id IS 'UUID of the secret in vault.secrets. Decrypt server-side only.';
COMMENT ON COLUMN sending_accounts.smtp_pass_vault_id IS 'UUID of the secret in vault.secrets. Decrypt server-side only.';
COMMENT ON COLUMN sending_accounts.emails_sent_today IS 'Atomic counter. Reset to 0 by pg_cron job each midnight UTC.';

CREATE INDEX idx_sending_accounts_workspace ON sending_accounts (workspace_id);
CREATE INDEX idx_sending_accounts_active    ON sending_accounts (workspace_id, is_active)
  WHERE is_active = true;

-- ── A view that EXCLUDES credential columns ───────────────────────────────
-- Client-facing queries MUST use this view, never the base table.
CREATE VIEW sending_accounts_safe AS
  SELECT
    id, workspace_id, name, from_email, from_name, type,
    -- Credential columns are intentionally omitted
    smtp_host, smtp_port, smtp_user, smtp_secure,
    daily_limit, emails_sent_today, quota_reset_at,
    is_active, last_error, last_used_at,
    created_at, updated_at
  FROM sending_accounts;

COMMENT ON VIEW sending_accounts_safe IS 'Credential-free view of sending_accounts. Always use this for client queries.';

-- ── emails ────────────────────────────────────────────────────────────────
-- One row per email sent or queued. Never deleted (audit trail).
CREATE TABLE emails (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id               uuid NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  sending_account_id    uuid NOT NULL REFERENCES sending_accounts(id) ON DELETE RESTRICT,
  campaign_id           uuid,  -- FK added after campaigns table is created (migration 006)
  sequence_step_id      uuid,  -- FK added after campaign_sequence_steps (migration 006)
  sent_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- ── Content ───────────────────────────────────────────────────────────
  subject               text NOT NULL           CHECK (char_length(subject) BETWEEN 1 AND 500),
  body_html             text NOT NULL,
  body_text             text,

  -- ── Lifecycle ─────────────────────────────────────────────────────────
  status                email_status NOT NULL DEFAULT 'queued',
  scheduled_for         timestamptz,
  sent_at               timestamptz,
  opened_at             timestamptz,
  clicked_at            timestamptz,
  replied_at            timestamptz,
  bounced_at            timestamptz,
  bounce_reason         text                    CHECK (char_length(bounce_reason) <= 500),

  -- ── Tracking ──────────────────────────────────────────────────────────
  -- Unique pixel ID embedded in email HTML for open tracking
  tracking_pixel_id     uuid NOT NULL DEFAULT gen_random_uuid(),
  -- Message ID from Resend / SMTP for webhook matching
  resend_message_id     text,

  -- ── AI metadata ───────────────────────────────────────────────────────
  is_ai_generated       boolean NOT NULL DEFAULT false,
  ai_usage_id           uuid,  -- FK added after ai_usage_logs (migration 007)

  created_at            timestamptz NOT NULL DEFAULT now(),

  -- Tracking pixel must be globally unique
  UNIQUE (tracking_pixel_id)
);

COMMENT ON TABLE emails IS 'Immutable log of every email sent or queued. Never deleted.';
COMMENT ON COLUMN emails.tracking_pixel_id IS '1x1 GIF pixel ID for open tracking. Globally unique.';
COMMENT ON COLUMN emails.resend_message_id IS 'Message ID returned by Resend/SMTP. Used to match webhook events.';

CREATE INDEX idx_emails_workspace   ON emails (workspace_id);
CREATE INDEX idx_emails_lead        ON emails (lead_id, created_at DESC);
CREATE INDEX idx_emails_campaign    ON emails (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_emails_sent_by     ON emails (sent_by, workspace_id);
-- Queue processor: find emails ready to send
CREATE INDEX idx_emails_status_sch  ON emails (status, scheduled_for)
  WHERE status = 'queued';
-- Webhook handler: look up email by tracking pixel
CREATE INDEX idx_emails_pixel       ON emails (tracking_pixel_id);
-- Webhook handler: look up email by provider message ID
CREATE INDEX idx_emails_resend_id   ON emails (resend_message_id) WHERE resend_message_id IS NOT NULL;
-- Analytics: time-series queries scoped to workspace
CREATE INDEX idx_emails_analytics   ON emails (workspace_id, sent_at DESC)
  WHERE sent_at IS NOT NULL;
-- Bounce rate monitoring
CREATE INDEX idx_emails_bounced     ON emails (workspace_id, bounced_at DESC)
  WHERE bounced_at IS NOT NULL;

-- ── email_queue ───────────────────────────────────────────────────────────
-- Work queue polled by pg_cron / Edge Function every 2 minutes.
-- SECURITY: No RLS SELECT policy — only accessible via service role.
CREATE TABLE email_queue (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email_id              uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  sending_account_id    uuid NOT NULL REFERENCES sending_accounts(id) ON DELETE CASCADE,
  scheduled_for         timestamptz NOT NULL DEFAULT now(),
  -- Retry counter (max 3 attempts before marking email as 'failed')
  attempts              integer NOT NULL DEFAULT 0   CHECK (attempts >= 0 AND attempts <= 5),
  last_error            text                         CHECK (char_length(last_error) <= 1000),
  -- Set when a worker picks this row up. Prevents concurrent double-send.
  -- Cleared on failure (so next run can retry). Set permanently on success → row deleted.
  locked_at             timestamptz,
  locked_by             text,  -- worker instance ID for debugging
  created_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (email_id)  -- one queue entry per email
);

COMMENT ON TABLE email_queue IS 'Pull-based send queue polled by pg_cron worker. Service role only.';
COMMENT ON COLUMN email_queue.locked_at IS 'Set when a worker claims this row. Stale locks (>5 min) are released on next run.';

-- Queue processor primary access pattern: oldest scheduled, unlocked first
CREATE INDEX idx_email_queue_ready    ON email_queue (scheduled_for ASC, locked_at NULLS FIRST)
  WHERE attempts < 3;
CREATE INDEX idx_email_queue_account  ON email_queue (sending_account_id, scheduled_for);
