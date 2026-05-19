-- Per-rep call stats aggregated in SQL, returns a single jsonb row to
-- bypass PostgREST's 1000-row cap. Replaces the raw call_logs row-fetch
-- + activity_logs synthetic-count pattern in team-stats and rep-performance.
--
-- The synthetic counting from activity_logs (bulk: true) was added in the
-- same commit that started writing bulk calls to call_logs directly, so every
-- bulk call was being counted twice. All call paths now write to call_logs:
--   - Log Call UI     → call_logs row
--   - Status PATCH    → call_logs row (auto_logged: true)
--   - Bulk PATCH      → call_logs row (auto_logged: true, bulk: true)
--
-- Returns: [{logged_by, outcome, cnt}] grouped by (logged_by, outcome).
-- Callers compute both total-calls and calls-by-outcome per rep from this.
CREATE OR REPLACE FUNCTION public.get_call_stats_by_rep(
  p_workspace_id uuid,
  p_start        timestamptz,
  p_end          timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'logged_by', logged_by,
      'outcome',   outcome,
      'cnt',       cnt
    )),
    '[]'::jsonb
  )
  FROM (
    SELECT logged_by, outcome, count(*)::bigint AS cnt
    FROM   call_logs
    WHERE  workspace_id = p_workspace_id
      AND  called_at >= p_start
      AND  called_at <  p_end
    GROUP  BY logged_by, outcome
  ) sub
$$;

GRANT EXECUTE ON FUNCTION public.get_call_stats_by_rep(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;
