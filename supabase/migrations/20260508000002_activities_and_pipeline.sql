-- ── Activity priority + type enums ───────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE activity_priority AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE activity_item_type AS ENUM ('follow_up', 'callback');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE follow_ups
  ADD COLUMN IF NOT EXISTS type     activity_item_type NOT NULL DEFAULT 'follow_up',
  ADD COLUMN IF NOT EXISTS priority activity_priority  NOT NULL DEFAULT 'medium';

-- ── Pipeline stages seed function (updated) ───────────────────────────────
CREATE OR REPLACE FUNCTION seed_default_pipeline_stages(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO pipeline_stages (workspace_id, name, color, position, is_won, is_lost) VALUES
    (p_workspace_id, 'Interested',         '#6366f1', 0, false, false),
    (p_workspace_id, 'PE Qualified',       '#f59e0b', 1, false, false),
    (p_workspace_id, 'Needs Buyer',        '#3b82f6', 2, false, false),
    (p_workspace_id, 'Successful Intro',   '#10b981', 3, false, false),
    (p_workspace_id, 'Unsuccessful Intro', '#ef4444', 4, false, true),
    (p_workspace_id, 'Data Requests',      '#8b5cf6', 5, false, false),
    (p_workspace_id, 'LOI / Negotiation',  '#ec4899', 6, true,  false)
  ON CONFLICT DO NOTHING;
END $$;
