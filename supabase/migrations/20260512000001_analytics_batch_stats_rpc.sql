-- ═══════════════════════════════════════════════════════════════════════════
-- Per-batch analytics aggregate RPC
--
-- PostgREST has a server-side `db-max-rows` cap (1000) that .range()/.limit()
-- can't bypass — single-row responses are exempt though. Wrap the per-batch
-- aggregates in a JSONB-returning SQL function so /api/analytics/batches
-- returns accurate counts at 10k+ leads per batch.
--
-- Emails table doesn't have batch_id, so we derive it via lead_id → leads.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_batch_analytics(
  p_workspace_id uuid,
  p_batch_ids    uuid[]
)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lead_stats AS (
    SELECT
      batch_id,
      count(*)                                              AS total,
      count(*) FILTER (WHERE status = 'converted')          AS converted
    FROM leads
    WHERE workspace_id = p_workspace_id
      AND batch_id = ANY(p_batch_ids)
      AND deleted_at IS NULL
    GROUP BY batch_id
  ),
  email_stats AS (
    SELECT
      l.batch_id,
      count(*) FILTER (WHERE e.status <> 'queued')                       AS sent,
      count(*) FILTER (WHERE e.status IN ('opened','clicked','replied')) AS opened,
      count(*) FILTER (WHERE e.status = 'replied')                       AS replied
    FROM emails e
    JOIN leads  l ON l.id = e.lead_id
    WHERE e.workspace_id = p_workspace_id
      AND l.batch_id = ANY(p_batch_ids)
    GROUP BY l.batch_id
  )
  SELECT jsonb_build_object(
    'leads',  COALESCE((SELECT jsonb_agg(row_to_json(lead_stats))  FROM lead_stats),  '[]'::jsonb),
    'emails', COALESCE((SELECT jsonb_agg(row_to_json(email_stats)) FROM email_stats), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_batch_analytics(uuid, uuid[]) TO authenticated, service_role;
