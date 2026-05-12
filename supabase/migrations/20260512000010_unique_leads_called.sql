-- Returns the number of DISTINCT leads a rep called since a given moment.
-- "Calls today" against a daily target should track unique leads reached,
-- not raw call attempts — a rep can dial the same lead twice and it
-- shouldn't double-count.

CREATE OR REPLACE FUNCTION public.get_unique_leads_called(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_since        timestamptz
) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(DISTINCT lead_id)
  FROM   call_logs
  WHERE  workspace_id = p_workspace_id
    AND  logged_by    = p_user_id
    AND  called_at   >= p_since;
$$;

GRANT EXECUTE ON FUNCTION public.get_unique_leads_called(uuid, uuid, timestamptz)
  TO authenticated, service_role;
