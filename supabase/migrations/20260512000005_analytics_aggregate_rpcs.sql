-- Aggregate analytics RPCs for the four routes that still rely on the
-- broken .range(0, 99999) band-aid. PostgREST's row cap (1000) can't be
-- bypassed by .range() / .limit() — single-row jsonb responses are the
-- only escape. Same pattern as get_batch_analytics().

-- ── 1. get_time_series_analytics ────────────────────────────────────────
-- Daily email stats over a window. Replaces the JS bucket-and-fill loop
-- in /api/analytics/time-series. Gap-filling happens in SQL via
-- generate_series().
CREATE OR REPLACE FUNCTION public.get_time_series_analytics(
  p_workspace_id uuid,
  p_start        timestamptz,
  p_end          timestamptz,
  p_rep_id       uuid    DEFAULT NULL,
  p_campaign_id  uuid    DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH days AS (
    SELECT to_char(d::date, 'YYYY-MM-DD') AS day_str, d::date AS day
    FROM   generate_series(p_start::date, p_end::date, '1 day'::interval) AS d
  ),
  agg AS (
    SELECT to_char(sent_at::date, 'YYYY-MM-DD') AS day_str,
           count(*)                                                 AS sent,
           count(*) FILTER (WHERE status IN ('opened','clicked','replied')) AS opened,
           count(*) FILTER (WHERE status = 'clicked')               AS clicked,
           count(*) FILTER (WHERE status = 'replied')               AS replied,
           count(*) FILTER (WHERE status = 'bounced')               AS bounced
    FROM   emails
    WHERE  workspace_id = p_workspace_id
      AND  sent_at IS NOT NULL
      AND  sent_at >= p_start
      AND  sent_at <= p_end
      AND  (p_rep_id      IS NULL OR sent_by     = p_rep_id)
      AND  (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'series', coalesce(jsonb_agg(jsonb_build_object(
      'date',    d.day_str,
      'sent',    coalesce(a.sent, 0),
      'opened',  coalesce(a.opened, 0),
      'clicked', coalesce(a.clicked, 0),
      'replied', coalesce(a.replied, 0),
      'bounced', coalesce(a.bounced, 0)
    ) ORDER BY d.day), '[]'::jsonb)
  )
  FROM days d
  LEFT JOIN agg a ON a.day_str = d.day_str;
$$;

GRANT EXECUTE ON FUNCTION public.get_time_series_analytics(uuid, timestamptz, timestamptz, uuid, uuid)
  TO authenticated, service_role;

-- ── 2. get_email_metrics_analytics ──────────────────────────────────────
-- Totals + computed rates for a window. Replaces the JS reduce in
-- /api/analytics/email-metrics.
CREATE OR REPLACE FUNCTION public.get_email_metrics_analytics(
  p_workspace_id uuid,
  p_start        timestamptz,
  p_end          timestamptz,
  p_rep_id       uuid    DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH agg AS (
    SELECT count(*)                                                 AS sent,
           count(*) FILTER (WHERE status IN ('opened','clicked','replied')) AS opened,
           count(*) FILTER (WHERE status = 'clicked')               AS clicked,
           count(*) FILTER (WHERE status = 'replied')               AS replied,
           count(*) FILTER (WHERE status = 'bounced')               AS bounced
    FROM   emails
    WHERE  workspace_id = p_workspace_id
      AND  sent_at >= p_start
      AND  sent_at <= p_end
      AND  status <> 'queued'
      AND  (p_rep_id IS NULL OR sent_by = p_rep_id)
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'totals', jsonb_build_object(
      'sent',         sent,
      'opened',       opened,
      'clicked',      clicked,
      'replied',      replied,
      'bounced',      bounced,
      'open_rate',    CASE WHEN sent > 0 THEN round((100.0 * opened  / sent)::numeric, 1) ELSE 0 END,
      'click_rate',   CASE WHEN sent > 0 THEN round((100.0 * clicked / sent)::numeric, 1) ELSE 0 END,
      'reply_rate',   CASE WHEN sent > 0 THEN round((100.0 * replied / sent)::numeric, 1) ELSE 0 END,
      'bounce_rate',  CASE WHEN sent > 0 THEN round((100.0 * bounced / sent)::numeric, 1) ELSE 0 END
    )
  )
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_metrics_analytics(uuid, timestamptz, timestamptz, uuid)
  TO authenticated, service_role;

-- ── 3. get_leads_status_counts_for_rep ──────────────────────────────────
-- Rep-scoped variant of the existing get_leads_status_counts. Mirrors
-- the same TABLE return shape so the funnel route loops over it
-- identically.
CREATE OR REPLACE FUNCTION public.get_leads_status_counts_for_rep(
  p_workspace_id uuid,
  p_user_id      uuid
) RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT status::text, count(*)::bigint
  FROM   leads
  WHERE  workspace_id = p_workspace_id
    AND  assigned_to  = p_user_id
    AND  deleted_at IS NULL
  GROUP  BY status;
$$;

GRANT EXECUTE ON FUNCTION public.get_leads_status_counts_for_rep(uuid, uuid)
  TO authenticated, service_role;

-- ── 4. get_reps_analytics ───────────────────────────────────────────────
-- Per-rep call + follow-up + lead stats, plus an overview block, in one
-- jsonb response. Replaces three full-table fetches in /api/analytics/reps.
-- Member names/emails are joined client-side via getUsersByIdsFull.
CREATE OR REPLACE FUNCTION public.get_reps_analytics(
  p_workspace_id uuid,
  p_start        timestamptz,
  p_end          timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH mem AS (
    SELECT user_id, role
    FROM   workspace_members
    WHERE  workspace_id = p_workspace_id
      AND  is_active = true
  ),
  call_stats AS (
    SELECT logged_by,
           count(*)                                            AS calls,
           count(*) FILTER (WHERE outcome = 'answered')        AS calls_answered,
           count(*) FILTER (WHERE outcome = 'voicemail')       AS calls_voicemail,
           count(*) FILTER (WHERE outcome = 'no_answer')       AS calls_no_answer,
           count(*) FILTER (WHERE outcome = 'wrong_number')    AS calls_wrong_number,
           count(*) FILTER (WHERE outcome = 'callback_requested') AS calls_callback
    FROM   call_logs
    WHERE  workspace_id = p_workspace_id
      AND  called_at >= p_start
      AND  called_at <= p_end
    GROUP  BY logged_by
  ),
  fu_stats AS (
    SELECT assigned_to,
           count(*) FILTER (WHERE completed_at IS NULL)                                                AS follow_ups_pending,
           count(*) FILTER (WHERE completed_at IS NULL AND due_at < now())                             AS follow_ups_overdue,
           count(*) FILTER (WHERE completed_at IS NOT NULL AND completed_at >= p_start)                AS follow_ups_completed
    FROM   follow_ups
    WHERE  workspace_id = p_workspace_id
    GROUP  BY assigned_to
  ),
  lead_stats AS (
    SELECT assigned_to,
           count(*)                                                                                    AS leads_assigned,
           count(*) FILTER (WHERE status NOT IN ('do_not_contact','wrong_number','sold_already'))      AS leads_active,
           count(*) FILTER (WHERE status = 'new')                                                      AS leads_new
    FROM   leads
    WHERE  workspace_id = p_workspace_id
      AND  deleted_at IS NULL
    GROUP  BY assigned_to
  ),
  reps AS (
    SELECT m.user_id,
           m.role,
           coalesce(c.calls,                0) AS calls,
           coalesce(c.calls_answered,       0) AS calls_answered,
           coalesce(c.calls_voicemail,      0) AS calls_voicemail,
           coalesce(c.calls_no_answer,      0) AS calls_no_answer,
           coalesce(c.calls_wrong_number,   0) AS calls_wrong_number,
           coalesce(f.follow_ups_pending,   0) AS follow_ups_pending,
           coalesce(f.follow_ups_overdue,   0) AS follow_ups_overdue,
           coalesce(f.follow_ups_completed, 0) AS follow_ups_completed,
           coalesce(l.leads_assigned,       0) AS leads_assigned,
           coalesce(l.leads_active,         0) AS leads_active,
           coalesce(l.leads_new,            0) AS leads_new
    FROM   mem m
    LEFT JOIN call_stats c ON c.logged_by   = m.user_id
    LEFT JOIN fu_stats   f ON f.assigned_to = m.user_id
    LEFT JOIN lead_stats l ON l.assigned_to = m.user_id
  ),
  overall_calls AS (
    SELECT count(*)                                            AS total,
           count(*) FILTER (WHERE outcome = 'answered')        AS answered,
           count(*) FILTER (WHERE outcome = 'voicemail')       AS voicemail,
           count(*) FILTER (WHERE outcome = 'no_answer')       AS no_answer,
           count(*) FILTER (WHERE outcome = 'wrong_number')    AS wrong_number,
           count(*) FILTER (WHERE outcome = 'callback_requested') AS callback
    FROM   call_logs
    WHERE  workspace_id = p_workspace_id
      AND  called_at >= p_start
      AND  called_at <= p_end
  ),
  overall_fu AS (
    SELECT count(*) FILTER (WHERE completed_at IS NULL)                       AS follow_ups_due,
           count(*) FILTER (WHERE completed_at IS NULL AND due_at < now())    AS follow_ups_overdue
    FROM   follow_ups
    WHERE  workspace_id = p_workspace_id
  ),
  overall_leads AS (
    SELECT count(*)                                                                                    AS leads_total,
           count(*) FILTER (WHERE status NOT IN ('do_not_contact','wrong_number','sold_already'))      AS leads_active
    FROM   leads
    WHERE  workspace_id = p_workspace_id
      AND  deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'reps', coalesce((SELECT jsonb_agg(to_jsonb(reps) ORDER BY calls DESC) FROM reps), '[]'::jsonb),
    'overview', jsonb_build_object(
      'total',              (SELECT total              FROM overall_calls),
      'answered',           (SELECT answered           FROM overall_calls),
      'voicemail',          (SELECT voicemail          FROM overall_calls),
      'no_answer',          (SELECT no_answer          FROM overall_calls),
      'wrong_number',       (SELECT wrong_number       FROM overall_calls),
      'callback',           (SELECT callback           FROM overall_calls),
      'follow_ups_due',     (SELECT follow_ups_due     FROM overall_fu),
      'follow_ups_overdue', (SELECT follow_ups_overdue FROM overall_fu),
      'leads_total',        (SELECT leads_total        FROM overall_leads),
      'leads_active',       (SELECT leads_active       FROM overall_leads)
    ),
    'period', jsonb_build_object('start', p_start, 'end', p_end)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_reps_analytics(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;
