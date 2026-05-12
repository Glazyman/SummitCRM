-- Pipeline RPCs: trim each stage to top N by last_activity_at, return
-- per-stage counts + overall totals so the client doesn't have to load
-- every lead just to display "12 leads" or "3 hot leads".

-- ── get_pipeline_leads_json ─────────────────────────────────────────────
-- Returns:
--   { leads:  [...up to p_per_stage_limit per stage + null/unassigned...],
--     counts: { "<stage_id>": <int>, ... },
--     totals: { total_leads, hot_leads, deals_won, deals_in_progress } }
--
-- When p_assigned_to is set, every lead set (visible rows AND counts) is
-- scoped to that user — matches the rep-filter behavior on /leads.
--
-- p_search: optional substring (case-insensitive) — when provided, every
-- count/total reflects the filter result. Used by the search endpoint.
CREATE OR REPLACE FUNCTION public.get_pipeline_leads_json(
  p_workspace_id     uuid,
  p_assigned_to      uuid    DEFAULT NULL,
  p_per_stage_limit  int     DEFAULT 100,
  p_search           text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH filtered AS (
    SELECT l.id, l.workspace_id, l.first_name, l.last_name, l.email, l.phone,
           l.company, l.title, l.status, l.interest_status, l.pipeline_stage_id,
           l.assigned_to, l.batch_id, l.created_at, l.updated_at,
           l.last_contacted_at, l.last_activity_at, l.custom_fields
    FROM   leads l
    WHERE  l.workspace_id = p_workspace_id
      AND  l.deleted_at IS NULL
      AND  l.status NOT IN ('do_not_contact','unsubscribed')
      AND  (p_assigned_to IS NULL OR l.assigned_to = p_assigned_to)
      AND  (
        p_search IS NULL OR length(trim(p_search)) = 0
        OR (
          lower(coalesce(l.first_name, '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.last_name, '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.email, ''))     LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.company, ''))   LIKE '%' || lower(p_search) || '%'
        )
      )
  ),
  ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (
             PARTITION BY pipeline_stage_id
             ORDER BY coalesce(last_activity_at, updated_at) DESC
           ) AS rn
    FROM filtered
  ),
  trimmed AS (
    SELECT * FROM ranked WHERE rn <= p_per_stage_limit
  ),
  counts AS (
    SELECT coalesce(pipeline_stage_id::text, '__unassigned__') AS key,
           count(*) AS cnt
    FROM   filtered
    GROUP  BY pipeline_stage_id
  ),
  stage_meta AS (
    SELECT id, is_won, is_lost FROM pipeline_stages WHERE workspace_id = p_workspace_id
  ),
  totals AS (
    SELECT
      count(*) FILTER (WHERE pipeline_stage_id IS NOT NULL)                              AS total_leads,
      count(*) FILTER (WHERE interest_status = 'interested'
                         AND pipeline_stage_id IS NOT NULL)                              AS hot_leads,
      count(*) FILTER (WHERE pipeline_stage_id IS NOT NULL
                         AND pipeline_stage_id IN (SELECT id FROM stage_meta WHERE is_won))  AS deals_won,
      count(*) FILTER (WHERE pipeline_stage_id IS NOT NULL
                         AND pipeline_stage_id NOT IN (SELECT id FROM stage_meta WHERE is_won OR is_lost)) AS deals_in_progress
    FROM filtered
  )
  SELECT jsonb_build_object(
    'leads',  coalesce((SELECT jsonb_agg(to_jsonb(trimmed)
                                         ORDER BY pipeline_stage_id, coalesce(last_activity_at, updated_at) DESC)
                       FROM trimmed), '[]'::jsonb),
    'counts', coalesce((SELECT jsonb_object_agg(key, cnt) FROM counts), '{}'::jsonb),
    'totals', (SELECT to_jsonb(totals.*) FROM totals)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_pipeline_leads_json(uuid, uuid, int, text)
  TO authenticated, service_role;

-- ── get_pipeline_stage_overflow ─────────────────────────────────────────
-- Returns the next p_limit leads for a single stage, offset by p_offset.
-- Used by the "+N more" expand button.
CREATE OR REPLACE FUNCTION public.get_pipeline_stage_overflow(
  p_workspace_id uuid,
  p_stage_id     uuid,
  p_assigned_to  uuid    DEFAULT NULL,
  p_limit        int     DEFAULT 100,
  p_offset       int     DEFAULT 0
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY coalesce(l.last_activity_at, l.updated_at) DESC), '[]'::jsonb)
  FROM (
    SELECT id, workspace_id, first_name, last_name, email, phone, company, title,
           status, interest_status, pipeline_stage_id, assigned_to, batch_id,
           created_at, updated_at, last_contacted_at, last_activity_at, custom_fields
    FROM   leads
    WHERE  workspace_id = p_workspace_id
      AND  pipeline_stage_id = p_stage_id
      AND  deleted_at IS NULL
      AND  status NOT IN ('do_not_contact','unsubscribed')
      AND  (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
    ORDER BY coalesce(last_activity_at, updated_at) DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) l;
$$;

GRANT EXECUTE ON FUNCTION public.get_pipeline_stage_overflow(uuid, uuid, uuid, int, int)
  TO authenticated, service_role;
