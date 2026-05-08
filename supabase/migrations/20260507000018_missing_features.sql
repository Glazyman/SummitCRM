-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 018: Missing features
-- - Extend lead_status enum with outbound call outcomes
-- - Add interest_status enum + column on leads
-- - Add tags + lead_tags tables
-- - Add call_logs table
-- - Add pipeline_stages table
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extend lead_status enum ───────────────────────────────────────────────
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'called';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'emailed';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'voicemail';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'no_answer';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'wrong_number';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'sold_already';

-- ── Interest status enum ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE interest_status AS ENUM (
    'pending',
    'interested',
    'not_interested'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Add interest_status to leads ──────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interest_status interest_status NOT NULL DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_leads_interest ON leads (workspace_id, interest_status) WHERE deleted_at IS NULL;

-- ── Pipeline stages ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  color        text NOT NULL DEFAULT '#6366f1' CHECK (char_length(color) <= 20),
  position     integer NOT NULL DEFAULT 0,
  is_won       boolean NOT NULL DEFAULT false,
  is_lost      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_workspace ON pipeline_stages (workspace_id, position);

-- Add pipeline_stage_id to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads (pipeline_stage_id) WHERE deleted_at IS NULL;

-- ── Tags ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  color        text NOT NULL DEFAULT '#6366f1' CHECK (char_length(color) <= 20),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_workspace ON tags (workspace_id);

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id    uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_lead ON lead_tags (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag  ON lead_tags (tag_id);

-- ── Call logs ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE call_outcome AS ENUM (
    'answered',
    'voicemail',
    'no_answer',
    'wrong_number',
    'callback_requested'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS call_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  logged_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  outcome      call_outcome NOT NULL DEFAULT 'answered',
  duration_sec integer CHECK (duration_sec >= 0),
  notes        text CHECK (char_length(notes) <= 2000),
  called_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_lead      ON call_logs (lead_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_workspace ON call_logs (workspace_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_user      ON call_logs (logged_by, called_at DESC);

-- Add activity_type values for calls
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'call_logged';

-- ── Extend notification_type ──────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'task_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'unsubscribe';

-- ── RLS for new tables ────────────────────────────────────────────────────
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs       ENABLE ROW LEVEL SECURITY;

-- pipeline_stages
CREATE POLICY IF NOT EXISTS "pipeline_stages_member_read" ON pipeline_stages
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY IF NOT EXISTS "pipeline_stages_admin_write" ON pipeline_stages
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
        AND role IN ('admin', 'super_admin', 'manager')
    )
  );

-- tags
CREATE POLICY IF NOT EXISTS "tags_member_read" ON tags
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY IF NOT EXISTS "tags_member_write" ON tags
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY IF NOT EXISTS "tags_admin_manage" ON tags
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
        AND role IN ('admin', 'super_admin', 'manager')
    )
  );

-- lead_tags
CREATE POLICY IF NOT EXISTS "lead_tags_member_read" ON lead_tags
  FOR SELECT USING (
    lead_id IN (
      SELECT id FROM leads WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY IF NOT EXISTS "lead_tags_member_write" ON lead_tags
  FOR ALL USING (
    lead_id IN (
      SELECT id FROM leads WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

-- call_logs
CREATE POLICY IF NOT EXISTS "call_logs_member_read" ON call_logs
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY IF NOT EXISTS "call_logs_member_write" ON call_logs
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY IF NOT EXISTS "call_logs_owner_manage" ON call_logs
  FOR ALL USING (
    logged_by = auth.uid() OR workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
        AND role IN ('admin', 'super_admin', 'manager')
    )
  );

-- ── Default pipeline stages seed function ────────────────────────────────
-- Call this after creating a new workspace to seed default stages.
CREATE OR REPLACE FUNCTION seed_default_pipeline_stages(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO pipeline_stages (workspace_id, name, color, position)
  VALUES
    (p_workspace_id, 'New Lead',        '#6366f1', 0),
    (p_workspace_id, 'Contacted',       '#f59e0b', 1),
    (p_workspace_id, 'Qualified',       '#3b82f6', 2),
    (p_workspace_id, 'Proposal Sent',   '#8b5cf6', 3),
    (p_workspace_id, 'Negotiating',     '#ec4899', 4),
    (p_workspace_id, 'Closed Won',      '#10b981', 5),
    (p_workspace_id, 'Closed Lost',     '#ef4444', 6)
  ON CONFLICT DO NOTHING;
END $$;
