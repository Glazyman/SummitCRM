-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 016: Notifications & Reminders
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Notification type enum ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'reply_received',
    'bounce',
    'campaign_complete',
    'quota_warning',
    'follow_up_due',
    'lead_assigned',
    'ai_budget_warning',
    'ai_budget_critical',
    'ai_batch_complete',
    'member_invited',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── notifications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          text        NOT NULL,
  title         text        NOT NULL,
  body          text,
  link          text,
  is_read       boolean     NOT NULL DEFAULT false,
  lead_id       uuid        REFERENCES leads(id)    ON DELETE SET NULL,
  email_id      uuid        REFERENCES emails(id)   ON DELETE SET NULL,
  campaign_id   uuid        REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_workspace
  ON notifications (workspace_id, created_at DESC);

COMMENT ON TABLE notifications IS 'Per-user in-app notifications with real-time push via Supabase Realtime.';

-- ── notification_preferences ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id  uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          text    NOT NULL,
  in_app        boolean NOT NULL DEFAULT true,
  email_digest  boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, workspace_id, type)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user
  ON notification_preferences (user_id, workspace_id);

COMMENT ON TABLE notification_preferences IS 'Per-user preference toggles for each notification type and channel.';

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Notifications: only the recipient can read/update their own
CREATE POLICY "notif_own_select" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notif_own_update" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notif_own_delete" ON notifications
  FOR DELETE USING (user_id = auth.uid());

-- Preferences: user manages their own
CREATE POLICY "notif_pref_select" ON notification_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notif_pref_upsert" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- ── Enable Realtime on notifications ─────────────────────────────────────
-- (Publication must be enabled in Supabase Dashboard → Realtime, or via:)
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ── Auto-cleanup: delete notifications older than 90 days ─────────────────
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 2 * * *',   -- 2am UTC daily
  $$DELETE FROM notifications WHERE created_at < now() - INTERVAL '90 days'$$
) ON CONFLICT DO NOTHING;

-- ── pg_cron: check follow-ups due today at 9am UTC ───────────────────────
SELECT cron.schedule(
  'check-follow-ups',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url', true) || '/functions/v1/check-follow-ups',
    headers := json_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key', true))::text::json
  )
  $$
) ON CONFLICT DO NOTHING;

-- ── pg_cron: send daily digest at 8am UTC ────────────────────────────────
SELECT cron.schedule(
  'send-daily-digest',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url', true) || '/functions/v1/send-daily-digest',
    headers := json_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key', true))::text::json
  )
  $$
) ON CONFLICT DO NOTHING;
