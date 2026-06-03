-- ─────────────────────────────────────────────────────────────────────────
-- Pipeline stages revamp (M&A deal flow)
--
-- New board (left → right):
--   0  Interested        (entry; interest=interested auto-adds here — name kept)
--   1  Seeking Buyer     (was "Needs Buyer"; deals with no buyer yet)
--   2  Intro Made        (was "Successful Intro")
--   3  Data Requested    (was "Data Requests")
--   4  LOI / Negotiation (was the won stage — won flag REMOVED; an LOI is not a close)
--   5  Closed / Won      (NEW — the real terminal won stage, carries is_won)
--   6  Lost / Passed     (was "Unsuccessful Intro"; terminal lost, carries is_lost)
--
-- "PE Qualified" is removed — buyer type (PE vs private, and which one) now
-- lives on tags, not a pipeline stage.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Default stages for NEW workspaces.
CREATE OR REPLACE FUNCTION seed_default_pipeline_stages(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO pipeline_stages (workspace_id, name, color, position, is_won, is_lost) VALUES
    (p_workspace_id, 'Interested',        '#6366f1', 0, false, false),
    (p_workspace_id, 'Seeking Buyer',     '#3b82f6', 1, false, false),
    (p_workspace_id, 'Intro Made',        '#f59e0b', 2, false, false),
    (p_workspace_id, 'Data Requested',    '#8b5cf6', 3, false, false),
    (p_workspace_id, 'LOI / Negotiation', '#ec4899', 4, false, false),
    (p_workspace_id, 'Closed / Won',      '#10b981', 5, true,  false),
    (p_workspace_id, 'Lost / Passed',     '#ef4444', 6, false, true)
  ON CONFLICT DO NOTHING;
END $$;

-- 2) Migrate EXISTING workspaces' stages in place (match by old default name).
--    Renames keep each stage's id, so leads keep their pipeline_stage_id.

-- Drop "PE Qualified" only where it holds no leads (don't orphan any deal).
DELETE FROM pipeline_stages s
WHERE s.name = 'PE Qualified'
  AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.pipeline_stage_id = s.id);

UPDATE pipeline_stages SET name = 'Interested',        position = 0, color = '#6366f1', is_won = false, is_lost = false WHERE name = 'Interested';
UPDATE pipeline_stages SET name = 'Seeking Buyer',     position = 1, color = '#3b82f6', is_won = false, is_lost = false WHERE name = 'Needs Buyer';
UPDATE pipeline_stages SET name = 'Intro Made',        position = 2, color = '#f59e0b', is_won = false, is_lost = false WHERE name = 'Successful Intro';
UPDATE pipeline_stages SET name = 'Data Requested',    position = 3, color = '#8b5cf6', is_won = false, is_lost = false WHERE name = 'Data Requests';
UPDATE pipeline_stages SET name = 'LOI / Negotiation', position = 4, color = '#ec4899', is_won = false, is_lost = false WHERE name = 'LOI / Negotiation';
UPDATE pipeline_stages SET name = 'Lost / Passed',     position = 6, color = '#ef4444', is_won = false, is_lost = true  WHERE name = 'Unsuccessful Intro';

-- Add the real "Closed / Won" terminal stage to any workspace missing it.
INSERT INTO pipeline_stages (workspace_id, name, color, position, is_won, is_lost)
SELECT DISTINCT ps.workspace_id, 'Closed / Won', '#10b981', 5, true, false
FROM pipeline_stages ps
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages e
  WHERE e.workspace_id = ps.workspace_id AND e.name = 'Closed / Won'
);
