-- /leads server-side pagination RPCs.
--
-- get_workspace_leads_page: filters + sorts + paginates in SQL, returns
--   {rows, total_count, status_counts} as jsonb. status_counts ignores
--   the status filter (so the status bar shows accurate totals even
--   when a status is filtered in).
--
-- bulk_update_leads_by_filter / bulk_delete_leads_by_filter:
--   "Select All Matching" pattern. Takes the same filter args, applies
--   the update/delete server-side. Avoids sending 10k IDs over the wire.

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
  -- Whitelist sort column → expression. Anything unknown falls back to created_at.
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

  -- Build filtered set EXCLUDING the status array, so status_counts is
  -- accurate even when a status filter is active.
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
      AND  (
        p_search IS NULL OR length(trim(p_search)) = 0
        OR (
          lower(coalesce(l.first_name, '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.last_name,  '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.email,      '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.company,    '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.title,      '')) LIKE '%' || lower(p_search) || '%'
        )
      );

  SELECT coalesce(jsonb_object_agg(s, c), '{}'::jsonb)
  INTO   v_status_counts
  FROM (
    SELECT status::text AS s, count(*) AS c FROM _f_no_status GROUP BY status
  ) sc;

  -- Apply the status filter for the page + total.
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

GRANT EXECUTE ON FUNCTION public.get_workspace_leads_page(
  uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean,
  boolean, timestamptz, timestamptz, text, text, int, int
) TO authenticated, service_role;


-- ── bulk_update_leads_by_filter ─────────────────────────────────────────
-- Mirrors bulk_update_leads but takes filter args. Returns affected row
-- count. Status changes still happen via this RPC; the calling route
-- writes per-row activity_logs and call_logs (it knows the user_id and
-- the auto-call-outcome mapping).
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
  -- New values:
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
  -- Resolve matching ids (same filter logic as get_workspace_leads_page,
  -- including the status array filter this time).
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
    AND  (
      p_search IS NULL OR length(trim(p_search)) = 0
      OR (
        lower(coalesce(l.first_name, '')) LIKE '%' || lower(p_search) || '%'
        OR lower(coalesce(l.last_name,  '')) LIKE '%' || lower(p_search) || '%'
        OR lower(coalesce(l.email,      '')) LIKE '%' || lower(p_search) || '%'
        OR lower(coalesce(l.company,    '')) LIKE '%' || lower(p_search) || '%'
        OR lower(coalesce(l.title,      '')) LIKE '%' || lower(p_search) || '%'
      )
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

GRANT EXECUTE ON FUNCTION public.bulk_update_leads_by_filter(
  uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean,
  boolean, timestamptz, timestamptz, text, uuid, uuid, boolean, boolean
) TO authenticated, service_role;


-- ── bulk_delete_leads_by_filter ─────────────────────────────────────────
-- Hard delete by filter. Reuses the same matching logic.
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
      AND  (
        p_search IS NULL OR length(trim(p_search)) = 0
        OR (
          lower(coalesce(l.first_name, '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.last_name,  '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.email,      '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.company,    '')) LIKE '%' || lower(p_search) || '%'
          OR lower(coalesce(l.title,      '')) LIKE '%' || lower(p_search) || '%'
        )
      )
    RETURNING l.id
  )
  SELECT count(*) INTO v_count FROM del;

  RETURN jsonb_build_object('count', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bulk_delete_leads_by_filter(
  uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean,
  boolean, timestamptz, timestamptz
) TO authenticated, service_role;
