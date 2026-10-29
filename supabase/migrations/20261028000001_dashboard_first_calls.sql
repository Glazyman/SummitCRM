-- Dashboard first-call counts, computed in Postgres instead of paging every
-- call_logs row to the server and running firstCalls() in JS.
--   leads_called: leads whose first-ever call (any rep) is at/after p_since
--   calls_today:  leads whose first call BY p_user_id is at/after p_today
-- SECURITY INVOKER: RLS scopes it exactly like the previous direct select.

CREATE OR REPLACE FUNCTION public.get_dashboard_first_calls(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_since        timestamptz,
  p_today        timestamptz
) RETURNS TABLE(leads_called bigint, calls_today bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*) FROM (
       SELECT lead_id FROM call_logs
       WHERE  workspace_id = p_workspace_id AND lead_id IS NOT NULL
       GROUP  BY lead_id
       HAVING min(called_at) >= p_since) first_any),
    (SELECT count(*) FROM (
       SELECT lead_id FROM call_logs
       WHERE  workspace_id = p_workspace_id AND logged_by = p_user_id AND lead_id IS NOT NULL
       GROUP  BY lead_id
       HAVING min(called_at) >= p_today) first_mine);
$$;
GRANT EXECUTE ON FUNCTION public.get_dashboard_first_calls(uuid, uuid, timestamptz, timestamptz)
  TO authenticated, service_role;
