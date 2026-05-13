-- §18 #4 from HANDOFF-2026-05-12-pm.md
--
-- Backfill the canonical definition of get_workspace_leads_json. This
-- RPC powers /leads and /pipeline. It existed only in prod until now —
-- it was modified twice in the 2026-05-12 session (added
-- last_contacted_at + last_call_outcome via 20260512000004, then
-- last_activity_at via 20260512000007) but neither migration
-- redeclared the function. A fresh-DB rebuild would have been missing
-- the columns from the returned JSON.
--
-- This migration captures the current production definition so the
-- repo is the source of truth going forward. Identical to what's
-- already running in prod — applying it is a no-op against the
-- existing function (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_workspace_leads_json(
  p_workspace_id uuid,
  p_assigned_to  uuid    DEFAULT NULL,
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

GRANT EXECUTE ON FUNCTION public.get_workspace_leads_json(uuid, uuid, integer)
  TO anon, authenticated, service_role;
