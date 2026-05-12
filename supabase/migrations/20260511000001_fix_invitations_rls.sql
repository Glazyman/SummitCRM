-- ═══════════════════════════════════════════════════════════════════════════
-- Fix invitations RLS — admins can read pending invites
--
-- The previous `invitations__select__admin_or_token` policy referenced
-- `auth.users` directly inside the OR clause. The `authenticated` role
-- doesn't have SELECT on auth.users, so the OR subquery errored, which
-- caused the entire policy to silently deny reads — pending invitations
-- never appeared on the team settings page.
--
-- Fix: wrap the auth.users lookup in a SECURITY DEFINER helper.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email::text FROM auth.users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;

DROP POLICY IF EXISTS invitations__select__admin_or_token ON public.invitations;

CREATE POLICY invitations__select__admin_or_token
  ON public.invitations
  FOR SELECT
  TO authenticated
  USING (
    is_admin(workspace_id)
    OR email = current_user_email()
  );
