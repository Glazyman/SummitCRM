-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 20260510000001: Rep Daily Call Targets
-- - Adds per-rep daily call target overrides
-- - Seeds workspace default target into workspaces.settings when missing
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rep_call_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_target  integer NOT NULL CHECK (daily_target >= 1 AND daily_target <= 10000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

COMMENT ON TABLE rep_call_targets IS 'Optional per-rep daily call target overrides. Falls back to workspace default when absent.';

CREATE INDEX IF NOT EXISTS idx_rep_call_targets_workspace ON rep_call_targets (workspace_id);
CREATE INDEX IF NOT EXISTS idx_rep_call_targets_user      ON rep_call_targets (user_id);

ALTER TABLE rep_call_targets ENABLE ROW LEVEL SECURITY;

-- Members can read targets in their own workspace.
CREATE POLICY IF NOT EXISTS "rep_call_targets_member_read"
  ON rep_call_targets FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Admin+ can manage targets.
CREATE POLICY IF NOT EXISTS "rep_call_targets_admin_manage"
  ON rep_call_targets FOR ALL
  USING (is_admin(workspace_id))
  WITH CHECK (is_admin(workspace_id));

-- Ensure workspace default exists (100) for all existing rows.
UPDATE workspaces
SET settings = jsonb_set(settings, '{daily_call_target}', to_jsonb(100), true)
WHERE NOT (settings ? 'daily_call_target');
