-- bulk_update_leads (ids-based bulk update) could never CLEAR assigned_to or
-- batch_id: it used `CASE WHEN p_x IS NOT NULL THEN p_x ELSE x END`, so passing
-- NULL meant "keep current" instead of "unassign / remove from batch". This made
-- bulk "Assign → Unassigned" a no-op (leads stayed on their rep).
--
-- Fix: add explicit p_clear_assigned / p_clear_batch flags, mirroring
-- bulk_update_leads_by_filter (20260512000009). Drop the old 5-arg signature
-- first so the named-arg call isn't ambiguous between the two overloads.

DROP FUNCTION IF EXISTS public.bulk_update_leads(uuid, uuid[], uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.bulk_update_leads(
  p_workspace_id   uuid,
  p_ids            uuid[],
  p_assigned_to    uuid    DEFAULT NULL::uuid,
  p_status         text    DEFAULT NULL::text,
  p_batch_id       uuid    DEFAULT NULL::uuid,
  p_clear_assigned boolean DEFAULT false,
  p_clear_batch    boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
BEGIN
  UPDATE leads
  SET
    assigned_to = CASE
                    WHEN p_clear_assigned          THEN NULL
                    WHEN p_assigned_to IS NOT NULL THEN p_assigned_to
                    ELSE assigned_to
                  END,
    batch_id    = CASE
                    WHEN p_clear_batch          THEN NULL
                    WHEN p_batch_id IS NOT NULL THEN p_batch_id
                    ELSE batch_id
                  END,
    status      = CASE WHEN p_status IS NOT NULL THEN p_status::lead_status ELSE status END,
    updated_at  = now()
  WHERE workspace_id = p_workspace_id
    AND id        = ANY(p_ids)
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bulk_update_leads(
  uuid, uuid[], uuid, text, uuid, boolean, boolean
) TO authenticated, service_role;
