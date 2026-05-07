-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 014: AI Enrichment Tables
-- ai_usage_logs, ai_draft_cache, ai_batch_jobs, workspace_settings
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ai_usage_logs ─────────────────────────────────────────────────────────
-- Every OpenAI API call is logged here for cost visibility and budget enforcement.
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model               text NOT NULL,   -- 'gpt-4o', 'gpt-4o-mini'
  task                text NOT NULL,   -- 'email_draft', 'subject_line', etc.
  lead_id             uuid REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id         uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  prompt_tokens       integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens   integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens        integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cost_usd            numeric(12, 8) NOT NULL DEFAULT 0,
  cached              boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_usage_logs IS 'Immutable log of all OpenAI API calls. Used for cost tracking and budget enforcement.';

CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace  ON ai_usage_logs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_month      ON ai_usage_logs (workspace_id, date_trunc('month', created_at));
CREATE INDEX IF NOT EXISTS idx_ai_usage_user       ON ai_usage_logs (user_id, created_at DESC);

-- ── ai_draft_cache ────────────────────────────────────────────────────────
-- SHA-256 keyed cache for AI-generated content. Prevents duplicate API calls
-- for the same prompt inputs within the TTL window.
CREATE TABLE IF NOT EXISTS ai_draft_cache (
  cache_key   text PRIMARY KEY,               -- SHA-256 hex of prompt inputs
  result      jsonb NOT NULL,                 -- The cached AI response
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_draft_cache IS '24-hour prompt result cache. Identical inputs return cached result without calling OpenAI.';

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_draft_cache (expires_at);

-- ── ai_batch_jobs ─────────────────────────────────────────────────────────
-- Tracks batch AI personalisation jobs for campaigns.
-- Each campaign step with use_ai=true creates one batch job on campaign start.
CREATE TABLE IF NOT EXISTS ai_batch_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_number     integer NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total           integer NOT NULL DEFAULT 0,
  processed       integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  error           text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, step_number)
);

COMMENT ON TABLE ai_batch_jobs IS 'Tracks progress of batch AI email personalisation for campaign steps.';

CREATE INDEX IF NOT EXISTS idx_ai_batch_campaign  ON ai_batch_jobs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_batch_status    ON ai_batch_jobs (workspace_id, status);

-- ── workspace_settings ────────────────────────────────────────────────────
-- Per-workspace configurable settings (AI budget, preferences, etc.)
-- Using a separate table so workspace schema stays clean.
CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id              uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  ai_monthly_token_budget   integer NOT NULL DEFAULT 1000000,
  ai_enabled                boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE workspace_settings IS 'Per-workspace configuration including AI token budget.';

-- Auto-create settings row when a workspace is created
CREATE OR REPLACE FUNCTION create_workspace_settings()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO workspace_settings (workspace_id)
  VALUES (NEW.id)
  ON CONFLICT (workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_workspace_settings ON workspaces;
CREATE TRIGGER trg_create_workspace_settings
  AFTER INSERT ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION create_workspace_settings();

-- Backfill existing workspaces
INSERT INTO workspace_settings (workspace_id)
SELECT id FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;

-- ── pg_cron: clean expired cache rows daily ───────────────────────────────
SELECT cron.schedule(
  'clean-ai-draft-cache',
  '0 3 * * *',   -- 03:00 UTC daily
  $$DELETE FROM ai_draft_cache WHERE expires_at < now()$$
) ON CONFLICT DO NOTHING;

-- ── RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE ai_usage_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_draft_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_batch_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- ai_usage_logs: read by admin+; insert via service role only
CREATE POLICY "ai_usage_workspace_read" ON ai_usage_logs
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
        AND role IN ('admin', 'super_admin')
    )
  );

-- ai_batch_jobs: visible to manager+
CREATE POLICY "ai_batch_jobs_workspace_read" ON ai_batch_jobs
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
        AND role IN ('admin', 'super_admin', 'manager')
    )
  );

-- workspace_settings: readable by any member, writable by admin+
CREATE POLICY "workspace_settings_read" ON workspace_settings
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "workspace_settings_admin_write" ON workspace_settings
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
        AND role IN ('admin', 'super_admin')
    )
  );
