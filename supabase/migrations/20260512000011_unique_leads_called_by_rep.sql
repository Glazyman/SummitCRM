-- Batch variant of get_unique_leads_called: returns the unique-leads-
-- called count for every rep in a workspace since a given moment.
-- Used by the admin Rep Performance panel to show progress vs. daily
-- target without an N+1 round-trip.

CREATE OR REPLACE FUNCTION public.get_unique_leads_called_by_rep(
  p_workspace_id uuid,
  p_since        timestamptz
) RETURNS TABLE(user_id uuid, leads_called bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT logged_by, count(DISTINCT lead_id)
  FROM   call_logs
  WHERE  workspace_id = p_workspace_id
    AND  called_at   >= p_since
  GROUP  BY logged_by;
$$;

GRANT EXECUTE ON FUNCTION public.get_unique_leads_called_by_rep(uuid, timestamptz)
  TO authenticated, service_role;
