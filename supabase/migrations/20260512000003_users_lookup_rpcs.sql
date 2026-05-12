-- Users-lookup RPCs to replace the lib/users-cache.ts band-aid.
--
-- Today: every page that needs to resolve a uuid → display name calls
-- adminClient.auth.admin.listUsers() which scans every user in the entire
-- Supabase project. A 30s in-memory cache hides the pain but doesn't fix
-- the underlying full-project scan, and the cache must be manually
-- invalidated after accept-invite to avoid showing stale names.
--
-- These RPCs replace that with workspace-scoped lookups. SECURITY DEFINER
-- so they can read auth.users (the `authenticated` role lacks SELECT on
-- that table). Workspace-membership check inside the function provides
-- the security boundary.

-- ── get_users_by_ids ────────────────────────────────────────────────────
-- Returns the subset of p_user_ids that are members of p_workspace_id
-- (any membership status — keeps audit-trail display working for
-- deactivated members), as a jsonb array.
CREATE OR REPLACE FUNCTION public.get_users_by_ids(
  p_workspace_id uuid,
  p_user_ids     uuid[]
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',        u.id,
      'email',     u.email,
      'full_name', u.raw_user_meta_data->>'full_name'
    )
    ORDER BY u.email
  ), '[]'::jsonb)
  FROM auth.users u
  WHERE u.id = ANY(p_user_ids)
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.user_id      = u.id
        AND wm.workspace_id = p_workspace_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_users_by_ids(uuid, uuid[])
  TO authenticated, service_role;

-- ── get_user_by_email ───────────────────────────────────────────────────
-- Not workspace-scoped — the invite + accept-invite flows run BEFORE
-- membership exists. Service-role only to prevent email enumeration
-- from the authenticated role.
CREATE OR REPLACE FUNCTION public.get_user_by_email(p_email text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT jsonb_build_object(
    'id',                 u.id,
    'email',              u.email,
    'full_name',          u.raw_user_meta_data->>'full_name',
    'email_confirmed_at', u.email_confirmed_at
  )
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_by_email(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_user_by_email(text) FROM authenticated, anon;
