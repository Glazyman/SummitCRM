-- Denormalize last_activity_at onto leads so the pipeline page can sort
-- columns by "most recent real activity" without joining 3 tables.
--
-- Activity sources (any of these bumps last_activity_at):
--   call_logs.called_at  — we logged a call
--   emails.sent_at       — we sent an email (NULL until actually sent)
--   notes.created_at     — we added a note (and notes.deleted_at IS NULL)

-- ── 1. Column + index ───────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_last_activity
  ON public.leads (workspace_id, last_activity_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- ── 2. Backfill ─────────────────────────────────────────────────────────
UPDATE public.leads l
SET    last_activity_at = sub.max_at
FROM   (
  SELECT lead_id, max(activity_at) AS max_at
  FROM (
    SELECT lead_id, called_at  AS activity_at FROM public.call_logs
    UNION ALL
    SELECT lead_id, sent_at                  FROM public.emails WHERE sent_at IS NOT NULL
    UNION ALL
    SELECT lead_id, created_at               FROM public.notes  WHERE deleted_at IS NULL
  ) acts
  GROUP BY lead_id
) sub
WHERE l.id = sub.lead_id;

-- ── 3. Recompute helper (private to triggers below) ─────────────────────
CREATE OR REPLACE FUNCTION public.recompute_lead_last_activity(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_max timestamptz;
BEGIN
  IF p_lead_id IS NULL THEN RETURN; END IF;

  SELECT max(activity_at) INTO new_max
  FROM (
    SELECT called_at  AS activity_at FROM public.call_logs WHERE lead_id = p_lead_id
    UNION ALL
    SELECT sent_at                  FROM public.emails    WHERE lead_id = p_lead_id AND sent_at IS NOT NULL
    UNION ALL
    SELECT created_at               FROM public.notes     WHERE lead_id = p_lead_id AND deleted_at IS NULL
  ) acts;

  UPDATE public.leads SET last_activity_at = new_max WHERE id = p_lead_id;
END;
$function$;

-- ── 4. Trigger function (shared across the three source tables) ─────────
CREATE OR REPLACE FUNCTION public.sync_lead_last_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_lead_last_activity(OLD.lead_id);
    RETURN OLD;
  END IF;

  -- INSERT or UPDATE: recompute the affected lead. If the row's lead_id
  -- changed (rare), recompute the old one too.
  PERFORM public.recompute_lead_last_activity(NEW.lead_id);
  IF TG_OP = 'UPDATE' AND OLD.lead_id IS DISTINCT FROM NEW.lead_id THEN
    PERFORM public.recompute_lead_last_activity(OLD.lead_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 5. Triggers on the three source tables ──────────────────────────────
DROP TRIGGER IF EXISTS trg_call_logs_sync_last_activity ON public.call_logs;
CREATE TRIGGER trg_call_logs_sync_last_activity
  AFTER INSERT OR DELETE OR UPDATE OF called_at, lead_id
  ON public.call_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_last_activity();

DROP TRIGGER IF EXISTS trg_emails_sync_last_activity ON public.emails;
CREATE TRIGGER trg_emails_sync_last_activity
  AFTER INSERT OR DELETE OR UPDATE OF sent_at, lead_id
  ON public.emails
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_last_activity();

DROP TRIGGER IF EXISTS trg_notes_sync_last_activity ON public.notes;
CREATE TRIGGER trg_notes_sync_last_activity
  AFTER INSERT OR DELETE OR UPDATE OF created_at, lead_id, deleted_at
  ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_last_activity();

-- ── 6. Include last_activity_at in the workspace leads RPC ──────────────
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
           last_contacted_at, last_call_outcome, last_activity_at
    FROM   leads
    WHERE  workspace_id = p_workspace_id
      AND  deleted_at   IS NULL
      AND  (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
    ORDER BY created_at DESC
    LIMIT  p_max_rows
  ) l;
$function$;
