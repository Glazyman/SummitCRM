-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 008: Helper Functions
-- Security-definer functions used by RLS policies and application logic.
-- SECURITY DEFINER = runs with function owner's privileges (postgres role),
-- not the calling user's privileges. This allows safe cross-table checks.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── get_my_role ───────────────────────────────────────────────────────────
-- Returns the calling user's role within a workspace, or NULL if not a member.
-- Called frequently in RLS policies — marked STABLE for query-plan caching.
CREATE OR REPLACE FUNCTION get_my_role(ws_id uuid)
RETURNS workspace_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM workspace_members
  WHERE workspace_id = ws_id
    AND user_id      = auth.uid()
    AND is_active    = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_my_role(uuid) IS
  'Returns auth.uid() role in the given workspace, or NULL if not a member.
   Used in RLS policies. SECURITY DEFINER to avoid RLS recursion.';

-- ── is_workspace_member ───────────────────────────────────────────────────
-- Returns true if the calling user is an active member of the workspace.
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id
      AND user_id      = auth.uid()
      AND is_active    = true
  );
$$;

-- ── role_rank ─────────────────────────────────────────────────────────────
-- Returns an integer rank for a workspace_role (higher = more access).
-- Used in comparison functions below.
CREATE OR REPLACE FUNCTION role_rank(r workspace_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE r
    WHEN 'viewer'      THEN 0
    WHEN 'rep'         THEN 1
    WHEN 'manager'     THEN 2
    WHEN 'admin'       THEN 3
    WHEN 'super_admin' THEN 4
    ELSE -1
  END;
$$;

-- ── has_role ──────────────────────────────────────────────────────────────
-- Returns true if the calling user's role in ws_id >= required_role.
CREATE OR REPLACE FUNCTION has_role(ws_id uuid, required_role workspace_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role_rank(get_my_role(ws_id)) >= role_rank(required_role);
$$;

-- ── is_admin ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_my_role(ws_id) IN ('admin', 'super_admin');
$$;

-- ── is_manager_or_above ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_manager_or_above(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_my_role(ws_id) IN ('manager', 'admin', 'super_admin');
$$;

-- ── can_view_lead ─────────────────────────────────────────────────────────
-- Encapsulates the lead visibility rule:
--   manager/admin/super_admin → see ALL leads in workspace
--   rep/viewer                → see ONLY leads assigned to them
CREATE OR REPLACE FUNCTION can_view_lead(lead_row leads)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE get_my_role(lead_row.workspace_id)
      WHEN 'super_admin' THEN true
      WHEN 'admin'       THEN true
      WHEN 'manager'     THEN true
      -- rep and viewer can only see leads assigned to them
      WHEN 'rep'         THEN lead_row.assigned_to = auth.uid()
      WHEN 'viewer'      THEN lead_row.assigned_to = auth.uid()
      ELSE false
    END;
$$;

-- ── get_user_workspace_id ─────────────────────────────────────────────────
-- Returns the workspace_id for the calling user (assumes single workspace per user).
CREATE OR REPLACE FUNCTION get_user_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id
  FROM workspace_members
  WHERE user_id   = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- ── increment_sending_quota ───────────────────────────────────────────────
-- Atomically increments emails_sent_today. Returns false if quota is full.
-- Called by the queue processor (service role) before each send.
CREATE OR REPLACE FUNCTION increment_sending_quota(account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_rows integer;
BEGIN
  UPDATE sending_accounts
  SET
    emails_sent_today = emails_sent_today + 1,
    last_used_at      = now()
  WHERE id                 = account_id
    AND is_active          = true
    AND emails_sent_today  < daily_limit
    -- Auto-reset quota if it's a new day
    AND (
      quota_reset_at = CURRENT_DATE
      OR (quota_reset_at < CURRENT_DATE
          AND (emails_sent_today := 0, quota_reset_at := CURRENT_DATE) IS NOT NULL)
    );

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows > 0;
END;
$$;

-- Simpler version without auto-reset (reset handled by pg_cron):
CREATE OR REPLACE FUNCTION try_increment_quota(account_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE sending_accounts
  SET emails_sent_today = emails_sent_today + 1,
      last_used_at      = now()
  WHERE id                = account_id
    AND is_active         = true
    AND emails_sent_today < daily_limit
  RETURNING true;
$$;

-- ── reset_all_quotas ──────────────────────────────────────────────────────
-- Called by pg_cron at midnight UTC. Resets all daily sending counters.
CREATE OR REPLACE FUNCTION reset_all_quotas()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE sending_accounts
  SET emails_sent_today = 0,
      quota_reset_at    = CURRENT_DATE
  WHERE quota_reset_at < CURRENT_DATE;
$$;

-- ── log_activity ──────────────────────────────────────────────────────────
-- Convenience function used by API routes. Inserts into activity_logs.
-- Callable by authenticated users via RPC (INSERT is blocked via RLS).
CREATE OR REPLACE FUNCTION log_activity(
  p_workspace_id  uuid,
  p_lead_id       uuid,
  p_type          activity_type,
  p_metadata      jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO activity_logs (workspace_id, lead_id, user_id, type, metadata)
  VALUES (p_workspace_id, p_lead_id, auth.uid(), p_type, p_metadata)
  RETURNING id;
$$;

-- ── custom JWT access token hook ─────────────────────────────────────────
-- Registered in Supabase Dashboard: Authentication → Hooks → Custom Access Token
-- Embeds workspace_id and role into the JWT for fast middleware checks.
CREATE OR REPLACE FUNCTION add_workspace_claims(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_row workspace_members%ROWTYPE;
BEGIN
  SELECT *
  INTO member_row
  FROM workspace_members
  WHERE user_id   = (event ->> 'user_id')::uuid
    AND is_active = true
  ORDER BY joined_at DESC  -- most recently joined workspace if multiple
  LIMIT 1;

  IF FOUND THEN
    event := jsonb_set(event, '{claims,workspace_id}',
               to_jsonb(member_row.workspace_id::text));
    event := jsonb_set(event, '{claims,role}',
               to_jsonb(member_row.role::text));
  END IF;

  RETURN event;
END;
$$;

COMMENT ON FUNCTION add_workspace_claims(jsonb) IS
  'JWT hook: embeds workspace_id and role into token claims.
   Register in Supabase Dashboard under Authentication → Hooks.';

-- ── check_unsubscribed ────────────────────────────────────────────────────
-- Returns true if an email address is on the unsubscribe list for a workspace.
CREATE OR REPLACE FUNCTION check_unsubscribed(ws_id uuid, email_addr text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM unsubscribes
    WHERE workspace_id = ws_id
      AND lower(email) = lower(email_addr)
  );
$$;
