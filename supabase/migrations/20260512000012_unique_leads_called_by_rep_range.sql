-- Range variant of get_unique_leads_called_by_rep — supports historical
-- periods (a specific day, last week, etc.), not just "since X".

CREATE OR REPLACE FUNCTION public.get_unique_leads_called_by_rep_range(
  p_workspace_id uuid,
  p_start        timestamptz,
  p_end          timestamptz
) RETURNS TABLE(user_id uuid, leads_called bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT logged_by, count(DISTINCT lead_id)
  FROM   call_logs
  WHERE  workspace_id = p_workspace_id
    AND  called_at   >= p_start
    AND  called_at   <  p_end
  GROUP  BY logged_by;
$$;

GRANT EXECUTE ON FUNCTION public.get_unique_leads_called_by_rep_range(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;
