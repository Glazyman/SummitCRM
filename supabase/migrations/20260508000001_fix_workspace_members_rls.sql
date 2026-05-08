-- Fix infinite recursion in workspace_members SELECT policy.
-- The original policy queried workspace_members inside its own USING clause,
-- causing a recursive RLS evaluation → 500 on every workspace_members read.
-- Replace with the SECURITY DEFINER helper which bypasses RLS internally.

DROP POLICY IF EXISTS "workspace_members__select__member" ON workspace_members;

CREATE POLICY "workspace_members__select__member"
  ON workspace_members FOR SELECT
  USING (is_workspace_member(workspace_id));
