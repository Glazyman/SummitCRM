-- Denormalize last_contacted_at and last_call_outcome onto leads so /leads
-- and /pipeline don't have to fetch call_logs on every page view.
--
-- A trigger on call_logs keeps both columns fresh. Uses `called_at` (the
-- user-supplied moment of contact), not `created_at`, to match how the
-- existing UI sorts and filters.

-- ── 1. Columns ──────────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_call_outcome call_outcome;

-- Index supports cold-leads sort / "last contacted" rankings.
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted
  ON public.leads (workspace_id, last_contacted_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- ── 2. Backfill from call_logs ──────────────────────────────────────────
-- Most recent call per lead — sets both denorm columns in one pass.
UPDATE public.leads l
SET   last_contacted_at = recent.called_at,
      last_call_outcome = recent.outcome
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, called_at, outcome
  FROM   public.call_logs
  ORDER  BY lead_id, called_at DESC
) recent
WHERE l.id = recent.lead_id;

-- ── 3. Trigger function ─────────────────────────────────────────────────
-- Three cases:
--   INSERT — cheap UPDATE using GREATEST, sets outcome only when this row
--            becomes the new max.
--   DELETE — only recompute if the deleted row WAS the max.
--   UPDATE — only fires when called_at or lead_id changes; full recompute
--            on both old and new lead_id.
CREATE OR REPLACE FUNCTION public.sync_lead_last_contacted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected_lead uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.leads
    SET    last_contacted_at = NEW.called_at,
           last_call_outcome = NEW.outcome
    WHERE  id = NEW.lead_id
      AND  (last_contacted_at IS NULL OR NEW.called_at >= last_contacted_at);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Only recompute when the deleted row WAS the max.
    UPDATE public.leads
    SET    last_contacted_at = sub.called_at,
           last_call_outcome = sub.outcome
    FROM   (
      SELECT called_at, outcome
      FROM   public.call_logs
      WHERE  lead_id = OLD.lead_id
      ORDER  BY called_at DESC
      LIMIT  1
    ) sub
    WHERE  leads.id = OLD.lead_id
      AND  OLD.called_at >= leads.last_contacted_at;
    -- If no remaining calls, null the columns.
    UPDATE public.leads
    SET    last_contacted_at = NULL,
           last_call_outcome = NULL
    WHERE  id = OLD.lead_id
      AND  NOT EXISTS (SELECT 1 FROM public.call_logs WHERE lead_id = OLD.lead_id);
    RETURN OLD;
  END IF;

  -- UPDATE: handle both OLD.lead_id and NEW.lead_id (lead_id might change).
  FOR affected_lead IN
    SELECT DISTINCT v FROM (VALUES (OLD.lead_id), (NEW.lead_id)) AS t(v)
  LOOP
    UPDATE public.leads
    SET    last_contacted_at = sub.called_at,
           last_call_outcome = sub.outcome
    FROM   (
      SELECT called_at, outcome
      FROM   public.call_logs
      WHERE  lead_id = affected_lead
      ORDER  BY called_at DESC
      LIMIT  1
    ) sub
    WHERE  leads.id = affected_lead;

    -- If no calls remain (lead_id reassignment edge case), null out.
    UPDATE public.leads
    SET    last_contacted_at = NULL,
           last_call_outcome = NULL
    WHERE  id = affected_lead
      AND  NOT EXISTS (SELECT 1 FROM public.call_logs WHERE lead_id = affected_lead);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ── 4. Trigger registration ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_call_logs_sync_last_contacted ON public.call_logs;
CREATE TRIGGER trg_call_logs_sync_last_contacted
  AFTER INSERT OR DELETE OR UPDATE OF called_at, lead_id, outcome
  ON public.call_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_last_contacted();

-- ── 5. Update get_workspace_leads_json to return the new columns ────────
CREATE OR REPLACE FUNCTION public.get_workspace_leads_json(
  p_workspace_id uuid,
  p_assigned_to  uuid DEFAULT NULL::uuid,
  p_max_rows     integer DEFAULT 20000
)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(json_agg(row_to_json(l)), '[]'::json)
  FROM (
    SELECT id, workspace_id, first_name, last_name, email, phone, company, title,
           website, linkedin_url, status, interest_status, pipeline_stage_id,
           batch_id, assigned_to, custom_fields, created_at, updated_at,
           last_contacted_at, last_call_outcome
    FROM   leads
    WHERE  workspace_id = p_workspace_id
      AND  deleted_at   IS NULL
      AND  (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
    ORDER BY created_at DESC
    LIMIT  p_max_rows
  ) l;
$function$;
