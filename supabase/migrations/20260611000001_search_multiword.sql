-- Multi-word lead search fix.
--
-- BUG: every search RPC matched the WHOLE query against each column
-- separately (first_name LIKE '%john smith%' OR last_name LIKE '%john smith%' …),
-- so typing a full "First Last" name returned nothing — no single column
-- contains both words. Same flaw in the /leads table, pipeline ("deals"), and
-- bulk-by-filter paths.
--
-- FIX: a shared helper that tokenizes the query on whitespace and requires
-- EVERY token to appear somewhere in the combined searchable text
-- (first+last+email+company+title). Handles "First Last", "Last First",
-- "name + company", and partial tokens. Empty/NULL query = match all.

CREATE OR REPLACE FUNCTION public.lead_search_match(p_haystack text, p_query text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_query IS NULL OR length(btrim(p_query)) = 0
      OR NOT EXISTS (
        SELECT 1
        FROM   unnest(regexp_split_to_array(lower(btrim(p_query)), '\s+')) AS tok
        WHERE  tok <> ''
          AND  position(tok IN lower(coalesce(p_haystack, ''))) = 0
      );
$$;

GRANT EXECUTE ON FUNCTION public.lead_search_match(text, text) TO authenticated, service_role;


-- ── get_workspace_leads_page (the /leads table) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_leads_page(
  p_workspace_id        uuid,
  p_viewer_id           uuid,
  p_scope_to_rep        boolean     DEFAULT false,
  p_search              text        DEFAULT NULL,
  p_statuses            text[]      DEFAULT NULL,
  p_interests           text[]      DEFAULT NULL,
  p_batch_id            uuid        DEFAULT NULL,
  p_assigned_to         uuid        DEFAULT NULL,
  p_assigned_unassigned boolean     DEFAULT false,
  p_my_leads            boolean     DEFAULT false,
  p_cold_only           boolean     DEFAULT false,
  p_date_from           timestamptz DEFAULT NULL,
  p_date_to             timestamptz DEFAULT NULL,
  p_sort_by             text        DEFAULT 'created_at',
  p_sort_dir            text        DEFAULT 'desc',
  p_limit               int         DEFAULT 50,
  p_offset              int         DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sort_expr     text;
  v_sort_dir      text;
  v_total         bigint;
  v_status_counts jsonb;
  v_rows          jsonb;
BEGIN
  v_sort_expr := CASE lower(coalesce(p_sort_by, ''))
    WHEN 'name'              THEN $$lower(coalesce(first_name,'') || ' ' || coalesce(last_name,''))$$
    WHEN 'email'             THEN $$lower(coalesce(email,''))$$
    WHEN 'company'           THEN $$lower(coalesce(company,''))$$
    WHEN 'status'            THEN 'status::text'
    WHEN 'last_activity_at'  THEN 'last_activity_at'
    WHEN 'last_contacted_at' THEN 'last_contacted_at'
    WHEN 'updated_at'        THEN 'updated_at'
    ELSE                          'created_at'
  END;
  v_sort_dir := CASE lower(coalesce(p_sort_dir, '')) WHEN 'asc' THEN 'ASC' ELSE 'DESC' END;

  CREATE TEMP TABLE _f_no_status ON COMMIT DROP AS
    SELECT l.*
    FROM   leads l
    WHERE  l.workspace_id = p_workspace_id
      AND  l.deleted_at IS NULL
      AND  (NOT p_scope_to_rep OR l.assigned_to = p_viewer_id)
      AND  (NOT p_my_leads     OR l.assigned_to = p_viewer_id)
      AND  (p_batch_id IS NULL OR l.batch_id = p_batch_id)
      AND  (p_interests IS NULL OR array_length(p_interests, 1) IS NULL
              OR l.interest_status::text = ANY (p_interests))
      AND  (
        NOT p_assigned_unassigned OR l.assigned_to IS NULL
      )
      AND  (
        p_assigned_unassigned OR p_assigned_to IS NULL
        OR l.assigned_to = p_assigned_to
      )
      AND  (p_date_from IS NULL OR l.created_at >= p_date_from)
      AND  (p_date_to   IS NULL OR l.created_at <= p_date_to + interval '1 day')
      AND  (
        NOT p_cold_only OR (
          l.interest_status = 'pending'
          AND l.created_at < now() - interval '7 days'
          AND (
            l.last_call_outcome IN ('voicemail','no_answer')
            OR l.last_contacted_at IS NULL
          )
        )
      )
      AND  public.lead_search_match(
             coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'') || ' ' ||
             coalesce(l.email,'') || ' ' || coalesce(l.company,'') || ' ' || coalesce(l.title,''),
             p_search
           );

  SELECT coalesce(jsonb_object_agg(s, c), '{}'::jsonb)
  INTO   v_status_counts
  FROM (
    SELECT status::text AS s, count(*) AS c FROM _f_no_status GROUP BY status
  ) sc;

  CREATE TEMP TABLE _f ON COMMIT DROP AS
    SELECT * FROM _f_no_status
    WHERE  (p_statuses IS NULL OR array_length(p_statuses, 1) IS NULL
            OR status::text = ANY (p_statuses));

  SELECT count(*) INTO v_total FROM _f;

  EXECUTE format(
    $$SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
       FROM (
         SELECT *
         FROM _f
         ORDER BY %s %s NULLS LAST, id ASC
         LIMIT $1 OFFSET $2
       ) p$$,
    v_sort_expr, v_sort_dir
  ) INTO v_rows USING p_limit, p_offset;

  RETURN jsonb_build_object(
    'rows',          v_rows,
    'total_count',   v_total,
    'status_counts', v_status_counts
  );
END;
$function$;


-- ── bulk_update_leads_by_filter (Select-All-Matching update) ────────────────
CREATE OR REPLACE FUNCTION public.bulk_update_leads_by_filter(
  p_workspace_id        uuid,
  p_viewer_id           uuid,
  p_scope_to_rep        boolean     DEFAULT false,
  p_search              text        DEFAULT NULL,
  p_statuses            text[]      DEFAULT NULL,
  p_interests           text[]      DEFAULT NULL,
  p_batch_id_filter     uuid        DEFAULT NULL,
  p_assigned_to_filter  uuid        DEFAULT NULL,
  p_assigned_unassigned boolean     DEFAULT false,
  p_my_leads            boolean     DEFAULT false,
  p_cold_only           boolean     DEFAULT false,
  p_date_from           timestamptz DEFAULT NULL,
  p_date_to             timestamptz DEFAULT NULL,
  p_new_status          text        DEFAULT NULL,
  p_new_assigned_to     uuid        DEFAULT NULL,
  p_new_batch_id        uuid        DEFAULT NULL,
  p_clear_assigned      boolean     DEFAULT false,
  p_clear_batch         boolean     DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM   leads l
  WHERE  l.workspace_id = p_workspace_id
    AND  l.deleted_at IS NULL
    AND  (NOT p_scope_to_rep OR l.assigned_to = p_viewer_id)
    AND  (NOT p_my_leads     OR l.assigned_to = p_viewer_id)
    AND  (p_batch_id_filter IS NULL OR l.batch_id = p_batch_id_filter)
    AND  (p_interests IS NULL OR array_length(p_interests, 1) IS NULL
            OR l.interest_status::text = ANY (p_interests))
    AND  (p_statuses IS NULL OR array_length(p_statuses, 1) IS NULL
            OR l.status::text = ANY (p_statuses))
    AND  (NOT p_assigned_unassigned OR l.assigned_to IS NULL)
    AND  (p_assigned_unassigned OR p_assigned_to_filter IS NULL OR l.assigned_to = p_assigned_to_filter)
    AND  (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND  (p_date_to   IS NULL OR l.created_at <= p_date_to + interval '1 day')
    AND  (
      NOT p_cold_only OR (
        l.interest_status = 'pending'
        AND l.created_at < now() - interval '7 days'
        AND (l.last_call_outcome IN ('voicemail','no_answer') OR l.last_contacted_at IS NULL)
      )
    )
    AND  public.lead_search_match(
           coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'') || ' ' ||
           coalesce(l.email,'') || ' ' || coalesce(l.company,'') || ' ' || coalesce(l.title,''),
           p_search
         );

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('ids', '[]'::jsonb, 'count', 0);
  END IF;

  UPDATE leads
  SET    status      = COALESCE(p_new_status::lead_status, status),
         assigned_to = CASE
                         WHEN p_clear_assigned THEN NULL
                         WHEN p_new_assigned_to IS NOT NULL THEN p_new_assigned_to
                         ELSE assigned_to
                       END,
         batch_id    = CASE
                         WHEN p_clear_batch THEN NULL
                         WHEN p_new_batch_id IS NOT NULL THEN p_new_batch_id
                         ELSE batch_id
                       END
  WHERE  id = ANY (v_ids);

  RETURN jsonb_build_object('ids', to_jsonb(v_ids), 'count', array_length(v_ids, 1));
END;
$function$;


-- ── bulk_delete_leads_by_filter (Select-All-Matching delete) ────────────────
CREATE OR REPLACE FUNCTION public.bulk_delete_leads_by_filter(
  p_workspace_id        uuid,
  p_viewer_id           uuid,
  p_scope_to_rep        boolean     DEFAULT false,
  p_search              text        DEFAULT NULL,
  p_statuses            text[]      DEFAULT NULL,
  p_interests           text[]      DEFAULT NULL,
  p_batch_id_filter     uuid        DEFAULT NULL,
  p_assigned_to_filter  uuid        DEFAULT NULL,
  p_assigned_unassigned boolean     DEFAULT false,
  p_my_leads            boolean     DEFAULT false,
  p_cold_only           boolean     DEFAULT false,
  p_date_from           timestamptz DEFAULT NULL,
  p_date_to             timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count bigint;
BEGIN
  WITH del AS (
    DELETE FROM leads l
    WHERE  l.workspace_id = p_workspace_id
      AND  l.deleted_at IS NULL
      AND  (NOT p_scope_to_rep OR l.assigned_to = p_viewer_id)
      AND  (NOT p_my_leads     OR l.assigned_to = p_viewer_id)
      AND  (p_batch_id_filter IS NULL OR l.batch_id = p_batch_id_filter)
      AND  (p_interests IS NULL OR array_length(p_interests, 1) IS NULL
              OR l.interest_status::text = ANY (p_interests))
      AND  (p_statuses IS NULL OR array_length(p_statuses, 1) IS NULL
              OR l.status::text = ANY (p_statuses))
      AND  (NOT p_assigned_unassigned OR l.assigned_to IS NULL)
      AND  (p_assigned_unassigned OR p_assigned_to_filter IS NULL OR l.assigned_to = p_assigned_to_filter)
      AND  (p_date_from IS NULL OR l.created_at >= p_date_from)
      AND  (p_date_to   IS NULL OR l.created_at <= p_date_to + interval '1 day')
      AND  (
        NOT p_cold_only OR (
          l.interest_status = 'pending'
          AND l.created_at < now() - interval '7 days'
          AND (l.last_call_outcome IN ('voicemail','no_answer') OR l.last_contacted_at IS NULL)
        )
      )
      AND  public.lead_search_match(
             coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'') || ' ' ||
             coalesce(l.email,'') || ' ' || coalesce(l.company,'') || ' ' || coalesce(l.title,''),
             p_search
           )
    RETURNING l.id
  )
  SELECT count(*) INTO v_count FROM del;

  RETURN jsonb_build_object('count', v_count);
END;
$function$;


-- ── get_pipeline_leads_json (the pipeline / "deals" board) ───────────────────
-- (also adds `title` to the searchable text, which it was missing.)
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
      AND  public.lead_search_match(
             coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'') || ' ' ||
             coalesce(l.email,'') || ' ' || coalesce(l.company,'') || ' ' || coalesce(l.title,''),
             p_search
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
