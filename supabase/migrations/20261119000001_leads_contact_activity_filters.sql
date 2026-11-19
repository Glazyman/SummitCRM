-- Leads page: "Contact info" and "Activity" filters.
--
-- One helper decides the match so the list RPC and BOTH bulk-by-filter RPCs
-- agree exactly — "select all matching → delete" must never hit more rows
-- than the list showed.
--
-- Owner phone = the lead's own number (phone / phone_2 / phone_3), not the
-- company line in custom_fields.company_phone. A primary phone that is the
-- same digits as the company phone does not count as an owner phone.

CREATE OR REPLACE FUNCTION public.lead_digits(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

CREATE OR REPLACE FUNCTION public.lead_extra_match(l public.leads, p_contact text, p_activity text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  WITH x AS (
    SELECT
      (
        (public.lead_digits(l.phone) IS NOT NULL
          AND public.lead_digits(l.phone) IS DISTINCT FROM public.lead_digits(l.custom_fields->>'company_phone'))
        OR public.lead_digits(l.custom_fields->>'phone_2') IS NOT NULL
        OR public.lead_digits(l.custom_fields->>'phone_3') IS NOT NULL
      ) AS owner_phone,
      nullif(trim(coalesce(l.email, '')), '') IS NOT NULL AS has_email,
      (
        public.lead_digits(l.custom_fields->>'company_phone') IS NOT NULL
        OR public.lead_digits(l.custom_fields->>'company_phone_2') IS NOT NULL
      ) AS company_phone,
      (
        l.last_contacted_at IS NULL
        AND l.last_activity_at IS NULL
        AND l.status = 'new'
        AND l.interest_status = 'pending'
      ) AS never_touched
  )
  SELECT
    (CASE coalesce(p_contact, '')
       WHEN ''                  THEN true
       WHEN 'owner_phone'       THEN x.owner_phone
       WHEN 'email'             THEN x.has_email
       WHEN 'owner_phone_email' THEN x.owner_phone AND x.has_email
       WHEN 'company_phone_only' THEN NOT x.owner_phone AND x.company_phone
       WHEN 'no_phone'          THEN NOT x.owner_phone AND NOT x.company_phone
       WHEN 'no_email'          THEN NOT x.has_email
       ELSE true
     END)
    AND
    (CASE coalesce(p_activity, '')
       WHEN ''              THEN true
       WHEN 'never_touched' THEN x.never_touched
       WHEN 'touched'       THEN NOT x.never_touched
       WHEN 'never_called'  THEN l.last_contacted_at IS NULL
       WHEN 'called_7d'     THEN l.last_contacted_at >= now() - interval '7 days'
       WHEN 'stale_30d'     THEN l.last_contacted_at <  now() - interval '30 days'
       WHEN 'stale_90d'     THEN l.last_contacted_at <  now() - interval '90 days'
       ELSE true
     END)
  FROM x
$$;

-- ── List RPC ───────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_workspace_leads_page(uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, text, text, integer, integer);

CREATE FUNCTION public.get_workspace_leads_page(p_workspace_id uuid, p_viewer_id uuid, p_scope_to_rep boolean DEFAULT false, p_search text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_interests text[] DEFAULT NULL::text[], p_batch_id uuid DEFAULT NULL::uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_assigned_unassigned boolean DEFAULT false, p_my_leads boolean DEFAULT false, p_cold_only boolean DEFAULT false, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_contact text DEFAULT NULL::text, p_activity text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
      AND  public.lead_extra_match(l, p_contact, p_activity)
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

-- ── Bulk delete by filter ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.bulk_delete_leads_by_filter(uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz);

CREATE FUNCTION public.bulk_delete_leads_by_filter(p_workspace_id uuid, p_viewer_id uuid, p_scope_to_rep boolean DEFAULT false, p_search text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_interests text[] DEFAULT NULL::text[], p_batch_id_filter uuid DEFAULT NULL::uuid, p_assigned_to_filter uuid DEFAULT NULL::uuid, p_assigned_unassigned boolean DEFAULT false, p_my_leads boolean DEFAULT false, p_cold_only boolean DEFAULT false, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_contact text DEFAULT NULL::text, p_activity text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
      AND  public.lead_extra_match(l, p_contact, p_activity)
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

-- ── Bulk update by filter ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.bulk_update_leads_by_filter(uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, text, uuid, uuid, boolean, boolean);

CREATE FUNCTION public.bulk_update_leads_by_filter(p_workspace_id uuid, p_viewer_id uuid, p_scope_to_rep boolean DEFAULT false, p_search text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_interests text[] DEFAULT NULL::text[], p_batch_id_filter uuid DEFAULT NULL::uuid, p_assigned_to_filter uuid DEFAULT NULL::uuid, p_assigned_unassigned boolean DEFAULT false, p_my_leads boolean DEFAULT false, p_cold_only boolean DEFAULT false, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_new_status text DEFAULT NULL::text, p_new_assigned_to uuid DEFAULT NULL::uuid, p_new_batch_id uuid DEFAULT NULL::uuid, p_clear_assigned boolean DEFAULT false, p_clear_batch boolean DEFAULT false, p_contact text DEFAULT NULL::text, p_activity text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
    AND  public.lead_extra_match(l, p_contact, p_activity)
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

-- Recreated functions get default PUBLIC execute; match the originals.
REVOKE ALL ON FUNCTION public.get_workspace_leads_page(uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, text, text, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bulk_delete_leads_by_filter(uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bulk_update_leads_by_filter(uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, text, uuid, uuid, boolean, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_leads_page(uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, text, text, integer, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_delete_leads_by_filter(uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_update_leads_by_filter(uuid, uuid, boolean, text, text[], text[], uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, text, uuid, uuid, boolean, boolean, text, text) TO service_role;
