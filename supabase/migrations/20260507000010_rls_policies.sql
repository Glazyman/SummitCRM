-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 010: Row Level Security Policies
--
-- SECURITY MODEL OVERVIEW:
--
--   super_admin  │ All data in their workspace. Platform management.
--   admin        │ All data in their workspace. Team + account management.
--   manager      │ All leads/campaigns/emails in workspace. Read team data.
--   rep          │ Only leads ASSIGNED to them. Their own emails.
--   viewer       │ Read-only. Only leads assigned to them. No email sends.
--
-- ISOLATION GUARANTEE:
--   - Every policy checks workspace_id ownership first.
--   - No user can ever see data from another workspace, regardless of role.
--   - The email_queue and audit_logs are service-role only (no client access).
--
-- RLS ENABLED ON ALL TABLES. Service role bypasses all policies.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE workspaces                ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_batches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_imports              ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sending_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue               ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sequence_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_draft_cache            ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups                ENABLE ROW LEVEL SECURITY;
ALTER TABLE unsubscribes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. WORKSPACES
-- ═══════════════════════════════════════════════════════════════════════════

-- Read: any active member can see their workspace
CREATE POLICY "workspaces__select__member"
  ON workspaces FOR SELECT
  USING (is_workspace_member(id));

-- Update: admin+ only
CREATE POLICY "workspaces__update__admin"
  ON workspaces FOR UPDATE
  USING (is_admin(id))
  WITH CHECK (is_admin(id));

-- Insert: handled by service role on signup (no client INSERT)
-- Delete: service role only (no policy needed — no client should delete a workspace)

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. WORKSPACE_MEMBERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Read: all active members can see each other (for assignment dropdowns, etc.)
CREATE POLICY "workspace_members__select__member"
  ON workspace_members FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.is_active = true
    )
  );

-- Insert: admin can add members (invite acceptance also uses service role)
CREATE POLICY "workspace_members__insert__admin"
  ON workspace_members FOR INSERT
  WITH CHECK (is_admin(workspace_id));

-- Update: admin can change roles / deactivate; user can update their own joined_at
CREATE POLICY "workspace_members__update__admin"
  ON workspace_members FOR UPDATE
  USING (
    is_admin(workspace_id)
    OR user_id = auth.uid()  -- allows self-update (e.g. join timestamp)
  )
  WITH CHECK (
    is_admin(workspace_id)
    OR user_id = auth.uid()
  );

-- Delete: admin only (prefer deactivation over deletion)
CREATE POLICY "workspace_members__delete__admin"
  ON workspace_members FOR DELETE
  USING (is_admin(workspace_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. INVITATIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Read: admin+ can see all invitations; anyone can look up by token (for accept flow)
CREATE POLICY "invitations__select__admin_or_token"
  ON invitations FOR SELECT
  USING (
    is_admin(workspace_id)
    -- Allow unauthenticated accept-invite lookup: matched by token in API route (service role)
    -- Authenticated users looking up their own invite
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Insert: admin only
CREATE POLICY "invitations__insert__admin"
  ON invitations FOR INSERT
  WITH CHECK (is_admin(workspace_id));

-- Update: admin only (mark as accepted, extend expiry)
CREATE POLICY "invitations__update__admin"
  ON invitations FOR UPDATE
  USING (is_admin(workspace_id))
  WITH CHECK (is_admin(workspace_id));

-- Delete: admin only
CREATE POLICY "invitations__delete__admin"
  ON invitations FOR DELETE
  USING (is_admin(workspace_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. LEADS
-- KEY RULE:
--   manager/admin/super_admin → see ALL workspace leads
--   rep/viewer                → see ONLY leads where assigned_to = auth.uid()
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "leads__select__tiered"
  ON leads FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      -- Manager and above: see all workspace leads
      is_manager_or_above(workspace_id)
      OR
      -- Rep / Viewer: only assigned leads
      (
        is_workspace_member(workspace_id)
        AND assigned_to = auth.uid()
      )
    )
  );

-- Insert: rep and above (viewer cannot create leads)
CREATE POLICY "leads__insert__rep_and_above"
  ON leads FOR INSERT
  WITH CHECK (
    has_role(workspace_id, 'rep')
    -- Enforce workspace_id matches the inserter's workspace
    AND workspace_id = get_user_workspace_id()
  );

-- Update: rep and above; reps can only update their own assigned leads
CREATE POLICY "leads__update__rep_and_above"
  ON leads FOR UPDATE
  USING (
    is_manager_or_above(workspace_id)
    OR (
      has_role(workspace_id, 'rep')
      AND assigned_to = auth.uid()
    )
  )
  WITH CHECK (
    is_manager_or_above(workspace_id)
    OR (
      has_role(workspace_id, 'rep')
      AND assigned_to = auth.uid()
    )
  );

-- Delete (soft): manager and above
CREATE POLICY "leads__delete__manager_and_above"
  ON leads FOR DELETE
  USING (is_manager_or_above(workspace_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. LEAD_BATCHES
-- ═══════════════════════════════════════════════════════════════════════════

-- Read: all workspace members (needed for import wizard + campaign targeting)
CREATE POLICY "lead_batches__select__member"
  ON lead_batches FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Write: rep and above
CREATE POLICY "lead_batches__insert__rep"
  ON lead_batches FOR INSERT
  WITH CHECK (has_role(workspace_id, 'rep'));

CREATE POLICY "lead_batches__update__rep"
  ON lead_batches FOR UPDATE
  USING (has_role(workspace_id, 'rep'))
  WITH CHECK (has_role(workspace_id, 'rep'));

-- Delete: manager and above (batches may be used by campaigns)
CREATE POLICY "lead_batches__delete__manager"
  ON lead_batches FOR DELETE
  USING (is_manager_or_above(workspace_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. LEAD_IMPORTS
-- ═══════════════════════════════════════════════════════════════════════════

-- Read: rep and above see their own imports; admin/manager see all
CREATE POLICY "lead_imports__select__tiered"
  ON lead_imports FOR SELECT
  USING (
    is_manager_or_above(workspace_id)
    OR (has_role(workspace_id, 'rep') AND created_by = auth.uid())
  );

-- Insert: rep and above
CREATE POLICY "lead_imports__insert__rep"
  ON lead_imports FOR INSERT
  WITH CHECK (has_role(workspace_id, 'rep'));

-- Update: created_by or manager+ (to update status, counts)
CREATE POLICY "lead_imports__update__owner"
  ON lead_imports FOR UPDATE
  USING (
    is_manager_or_above(workspace_id)
    OR created_by = auth.uid()
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. NOTES
-- KEY RULE:
--   Users see notes on leads they can view.
--   Users can only edit/delete their OWN notes.
--   Admin can edit/delete any note.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "notes__select__tiered"
  ON notes FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      is_manager_or_above(workspace_id)
      OR (
        is_workspace_member(workspace_id)
        AND lead_id IN (
          SELECT id FROM leads
          WHERE assigned_to = auth.uid()
            AND deleted_at IS NULL
        )
      )
    )
  );

-- Insert: rep and above, on leads they can view
CREATE POLICY "notes__insert__rep"
  ON notes FOR INSERT
  WITH CHECK (
    has_role(workspace_id, 'rep')
    AND (
      is_manager_or_above(workspace_id)
      OR lead_id IN (
        SELECT id FROM leads
        WHERE assigned_to = auth.uid()
          AND deleted_at IS NULL
      )
    )
  );

-- Update: own note only, or admin
CREATE POLICY "notes__update__own_or_admin"
  ON notes FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      author_id = auth.uid()
      OR is_admin(workspace_id)
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    OR is_admin(workspace_id)
  );

-- Soft-delete (sets deleted_at): own note or admin
CREATE POLICY "notes__delete__own_or_admin"
  ON notes FOR DELETE
  USING (
    author_id = auth.uid()
    OR is_admin(workspace_id)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. SENDING_ACCOUNTS
-- KEY RULE:
--   All members can READ (for compose email dropdown).
--   Only admin can WRITE.
--   Credential columns (vault IDs) are masked by the sending_accounts_safe view.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "sending_accounts__select__member"
  ON sending_accounts FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "sending_accounts__insert__admin"
  ON sending_accounts FOR INSERT
  WITH CHECK (is_admin(workspace_id));

CREATE POLICY "sending_accounts__update__admin"
  ON sending_accounts FOR UPDATE
  USING (is_admin(workspace_id))
  WITH CHECK (is_admin(workspace_id));

CREATE POLICY "sending_accounts__delete__admin"
  ON sending_accounts FOR DELETE
  USING (is_admin(workspace_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. EMAILS
-- KEY RULE:
--   manager+ sees all workspace emails.
--   rep sees only emails they sent OR emails to their assigned leads.
--   viewer sees only emails to their assigned leads (read-only).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "emails__select__tiered"
  ON emails FOR SELECT
  USING (
    is_manager_or_above(workspace_id)
    OR (
      is_workspace_member(workspace_id)
      AND (
        sent_by = auth.uid()
        OR lead_id IN (
          SELECT id FROM leads
          WHERE assigned_to = auth.uid()
            AND deleted_at IS NULL
        )
      )
    )
  );

-- Insert: rep and above (viewer cannot send)
CREATE POLICY "emails__insert__rep"
  ON emails FOR INSERT
  WITH CHECK (has_role(workspace_id, 'rep'));

-- Update: service role handles most updates (status changes via webhook).
-- App-level: sent_by user can update subject/body while status='queued'.
-- Admin can update any email.
CREATE POLICY "emails__update__own_or_admin"
  ON emails FOR UPDATE
  USING (
    is_admin(workspace_id)
    OR (sent_by = auth.uid() AND status = 'queued')
  );

-- Delete: no client delete policy (emails are permanent audit trail)

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. EMAIL_QUEUE
-- COMPLETELY BLOCKED for all authenticated clients.
-- Only accessible via service role (queue processor Edge Function).
-- ═══════════════════════════════════════════════════════════════════════════

-- No SELECT, INSERT, UPDATE, or DELETE policies.
-- WITH RLS enabled and no permissive policies, all access is denied.
-- (A restrictive "deny all" policy is not needed — absence of permissive = deny.)

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. CAMPAIGNS
-- KEY RULE:
--   manager+ can create and manage campaigns.
--   rep sees only campaigns where they have sent emails.
--   viewer can see all campaigns (read-only).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "campaigns__select__tiered"
  ON campaigns FOR SELECT
  USING (
    is_manager_or_above(workspace_id)
    -- Viewer: can see all campaigns (read-only, no email sends)
    OR get_my_role(workspace_id) = 'viewer'
    -- Rep: can see campaigns where their leads received emails
    OR (
      get_my_role(workspace_id) = 'rep'
      AND id IN (
        SELECT DISTINCT campaign_id FROM emails
        WHERE sent_by = auth.uid()
          AND campaign_id IS NOT NULL
      )
    )
  );

-- Insert: manager and above
CREATE POLICY "campaigns__insert__manager"
  ON campaigns FOR INSERT
  WITH CHECK (is_manager_or_above(workspace_id));

-- Update: campaign creator or admin; draft campaigns only for non-admin
CREATE POLICY "campaigns__update__manager"
  ON campaigns FOR UPDATE
  USING (
    is_admin(workspace_id)
    OR (
      is_manager_or_above(workspace_id)
      AND (created_by = auth.uid() OR is_admin(workspace_id))
    )
  )
  WITH CHECK (
    is_admin(workspace_id)
    OR is_manager_or_above(workspace_id)
  );

-- Delete: admin only (campaigns have email history attached)
CREATE POLICY "campaigns__delete__admin"
  ON campaigns FOR DELETE
  USING (is_admin(workspace_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. CAMPAIGN_SEQUENCE_STEPS
-- ═══════════════════════════════════════════════════════════════════════════

-- Read: if you can see the campaign, you can see its steps
CREATE POLICY "steps__select__via_campaign"
  ON campaign_sequence_steps FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns
      WHERE is_workspace_member(workspace_id)
    )
  );

-- Write: manager+ (same access as campaign)
CREATE POLICY "steps__write__manager"
  ON campaign_sequence_steps FOR ALL
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE is_manager_or_above(workspace_id)
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE is_manager_or_above(workspace_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. ACTIVITY_LOGS
-- KEY RULE:
--   manager+ sees all workspace activity.
--   rep sees activity on their assigned leads + their own actions.
--   viewer sees activity on their assigned leads only.
--   INSERT via log_activity() RPC or service role only.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "activity_logs__select__tiered"
  ON activity_logs FOR SELECT
  USING (
    is_manager_or_above(workspace_id)
    OR (
      is_workspace_member(workspace_id)
      AND (
        -- Events they caused
        user_id = auth.uid()
        OR
        -- Events on leads assigned to them
        lead_id IN (
          SELECT id FROM leads
          WHERE assigned_to = auth.uid()
            AND deleted_at IS NULL
        )
      )
    )
  );

-- Insert: only via log_activity() RPC (SECURITY DEFINER), or service role.
-- Client direct INSERT is blocked — use the RPC.
CREATE POLICY "activity_logs__insert__rpc_only"
  ON activity_logs FOR INSERT
  WITH CHECK (
    -- Allow authenticated users to call log_activity() which invokes INSERT
    -- The RPC function is SECURITY DEFINER so it bypasses RLS for the insert itself.
    -- This policy acts as a fallback deny for direct client inserts.
    false
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. NOTIFICATIONS
-- KEY RULE: Users see and manage ONLY their own notifications.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "notifications__select__own"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Insert: service role only (notifications created by backend, not client)
-- Client cannot insert their own notifications.

-- Update: mark as read (own notifications only)
CREATE POLICY "notifications__update__own"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Delete: user can dismiss their own notifications
CREATE POLICY "notifications__delete__own"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. NOTIFICATION_PREFERENCES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "notif_prefs__all__own"
  ON notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- 16. AI_USAGE_LOGS
-- KEY RULE:
--   admin+ can see all workspace AI usage (cost visibility).
--   rep/manager can see their own usage.
--   viewer cannot see AI usage.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "ai_usage_logs__select__tiered"
  ON ai_usage_logs FOR SELECT
  USING (
    is_admin(workspace_id)
    OR (
      is_manager_or_above(workspace_id)
      AND user_id = auth.uid()
    )
    OR (
      get_my_role(workspace_id) = 'rep'
      AND user_id = auth.uid()
    )
  );

-- Insert: service role only (AI calls made server-side)
-- No client INSERT policy.

-- ═══════════════════════════════════════════════════════════════════════════
-- 17. AI_DRAFT_CACHE
-- Service role only. Clients never access this directly.
-- ═══════════════════════════════════════════════════════════════════════════

-- No permissive policies → deny all client access.

-- ═══════════════════════════════════════════════════════════════════════════
-- 18. FOLLOW_UPS
-- KEY RULE:
--   manager+ sees all workspace follow-ups.
--   rep/viewer sees only follow-ups assigned to them.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "follow_ups__select__tiered"
  ON follow_ups FOR SELECT
  USING (
    is_manager_or_above(workspace_id)
    OR (
      is_workspace_member(workspace_id)
      AND assigned_to = auth.uid()
    )
  );

-- Insert: rep and above (on their own leads)
CREATE POLICY "follow_ups__insert__rep"
  ON follow_ups FOR INSERT
  WITH CHECK (
    has_role(workspace_id, 'rep')
    AND (
      is_manager_or_above(workspace_id)
      OR lead_id IN (
        SELECT id FROM leads
        WHERE assigned_to = auth.uid()
          AND deleted_at IS NULL
      )
    )
  );

-- Update: assigned user or manager+
CREATE POLICY "follow_ups__update__assigned_or_manager"
  ON follow_ups FOR UPDATE
  USING (
    is_manager_or_above(workspace_id)
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    is_manager_or_above(workspace_id)
    OR assigned_to = auth.uid()
  );

-- Delete: assigned user or manager+
CREATE POLICY "follow_ups__delete__assigned_or_manager"
  ON follow_ups FOR DELETE
  USING (
    is_manager_or_above(workspace_id)
    OR assigned_to = auth.uid()
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 19. UNSUBSCRIBES
-- KEY RULE: All workspace members can READ (to check before sends).
--           Only service role can INSERT (via webhook handler).
--           Admin can manually INSERT (for DNC entries).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "unsubscribes__select__member"
  ON unsubscribes FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Admin can manually add unsubscribes
CREATE POLICY "unsubscribes__insert__admin"
  ON unsubscribes FOR INSERT
  WITH CHECK (is_admin(workspace_id));

-- Admin can remove unsubscribes (reinstate)
CREATE POLICY "unsubscribes__delete__admin"
  ON unsubscribes FOR DELETE
  USING (is_admin(workspace_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 20. AUDIT_LOGS
-- KEY RULE:
--   admin+ can READ (compliance, security review).
--   No client INSERT/UPDATE/DELETE — service role only.
--   Immutable trigger prevents modification even by service role.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "audit_logs__select__admin"
  ON audit_logs FOR SELECT
  USING (is_admin(workspace_id));

-- No INSERT/UPDATE/DELETE policies for clients.
-- Service role bypasses RLS for INSERT.

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY (run after applying migrations)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
-- ALL rows should have rowsecurity = true
