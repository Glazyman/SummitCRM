-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 007: Activity, Notifications, AI, and Support Tables
-- activity_logs, notifications, notification_preferences,
-- ai_usage_logs, ai_draft_cache, follow_ups, unsubscribes, audit_logs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── activity_logs ─────────────────────────────────────────────────────────
-- Immutable event log. Never updated or deleted. Used for lead timeline.
CREATE TABLE activity_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id       uuid REFERENCES leads(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type          activity_type NOT NULL,
  -- Flexible payload: e.g. { from_status, to_status } or { email_subject }
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
  -- Intentionally NO updated_at: activity logs are append-only
);

COMMENT ON TABLE activity_logs IS 'Append-only event log for all significant CRM actions. Never modified after insert.';
COMMENT ON COLUMN activity_logs.metadata IS 'Event-specific payload. Schema defined per activity_type in application code.';

-- Lead timeline: most recent first
CREATE INDEX idx_activity_lead         ON activity_logs (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;
-- Workspace-level feed (admin dashboard)
CREATE INDEX idx_activity_workspace    ON activity_logs (workspace_id, created_at DESC);
-- User-specific activity (for rep dashboard)
CREATE INDEX idx_activity_user         ON activity_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
-- Type-based queries (e.g. "all bounces this week")
CREATE INDEX idx_activity_type         ON activity_logs (workspace_id, type, created_at DESC);

-- ── notifications ─────────────────────────────────────────────────────────
-- In-app and email digest notifications. Pushed via Supabase Realtime.
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          notification_type NOT NULL,
  title         text NOT NULL               CHECK (char_length(title) BETWEEN 1 AND 200),
  body          text                        CHECK (char_length(body) <= 500),
  -- Deep link inside the app
  link          text                        CHECK (char_length(link) <= 500),
  is_read       boolean NOT NULL DEFAULT false,
  -- Optional contextual references
  lead_id       uuid REFERENCES leads(id) ON DELETE CASCADE,
  email_id      uuid REFERENCES emails(id) ON DELETE CASCADE,
  campaign_id   uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE notifications IS 'Per-user in-app notifications. Pushed via Supabase Realtime on INSERT.';

-- Primary read path: unread notifications for a user, newest first
CREATE INDEX idx_notif_user_unread ON notifications (user_id, created_at DESC)
  WHERE is_read = false;
-- All notifications for a user (notification centre page)
CREATE INDEX idx_notif_user_all    ON notifications (user_id, created_at DESC);
-- Dedup guard: prevent duplicate notifications for same event on same day
CREATE INDEX idx_notif_dedup       ON notifications (user_id, type, created_at);

-- ── notification_preferences ─────────────────────────────────────────────
-- Per-user, per-workspace, per-type preference flags.
CREATE TABLE notification_preferences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          notification_type NOT NULL,
  in_app        boolean NOT NULL DEFAULT true,
  email_digest  boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, workspace_id, type)
);

COMMENT ON TABLE notification_preferences IS 'User opt-in/out per notification channel and type.';

CREATE INDEX idx_notif_prefs_user ON notification_preferences (user_id, workspace_id);

-- ── ai_usage_logs ─────────────────────────────────────────────────────────
-- Append-only log of every OpenAI API call. Used for cost visibility.
CREATE TABLE ai_usage_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  model               text NOT NULL               CHECK (model IN ('gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo')),
  -- 'email_personalisation' | 'subject_line' | 'follow_up' | 'batch_personalisation' | 'lead_summary'
  task                text NOT NULL               CHECK (char_length(task) <= 100),
  prompt_tokens       integer NOT NULL            CHECK (prompt_tokens >= 0),
  completion_tokens   integer NOT NULL            CHECK (completion_tokens >= 0),
  total_tokens        integer NOT NULL            CHECK (total_tokens >= 0),
  -- Computed cost in USD at time of call (model pricing may change)
  cost_usd            numeric(10, 6)              CHECK (cost_usd >= 0),
  lead_id             uuid REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id         uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_usage_logs IS 'Append-only cost tracking for all OpenAI API calls.';

CREATE INDEX idx_ai_usage_workspace ON ai_usage_logs (workspace_id, created_at DESC);
CREATE INDEX idx_ai_usage_user      ON ai_usage_logs (user_id, created_at DESC);
-- Monthly budget calculation
CREATE INDEX idx_ai_usage_monthly   ON ai_usage_logs (workspace_id, date_trunc('month', created_at));

-- ── ai_draft_cache ────────────────────────────────────────────────────────
-- 24-hour cache for identical AI prompts to avoid redundant API calls.
CREATE TABLE ai_draft_cache (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key   text NOT NULL UNIQUE         CHECK (char_length(cache_key) = 64),  -- SHA-256 hex
  result_json jsonb NOT NULL,
  hit_count   integer NOT NULL DEFAULT 0   CHECK (hit_count >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

COMMENT ON TABLE ai_draft_cache IS 'SHA-256 keyed cache for AI responses. Reduces duplicate OpenAI calls.';

CREATE INDEX idx_ai_cache_key     ON ai_draft_cache (cache_key);
CREATE INDEX idx_ai_cache_expires ON ai_draft_cache (expires_at);  -- For cleanup job

-- ── follow_ups ────────────────────────────────────────────────────────────
-- Scheduled follow-up tasks linked to a lead.
CREATE TABLE follow_ups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title           text NOT NULL             CHECK (char_length(title) BETWEEN 1 AND 200),
  notes           text                      CHECK (char_length(notes) <= 2000),
  due_at          timestamptz NOT NULL,
  completed_at    timestamptz,
  is_ai_suggested boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE follow_ups IS 'Scheduled follow-up tasks. Notified via pg_cron daily check at 9am UTC.';

-- Rep dashboard: "my due follow-ups"
CREATE INDEX idx_follow_ups_due        ON follow_ups (assigned_to, due_at)
  WHERE completed_at IS NULL;
-- Lead detail: all follow-ups for a lead
CREATE INDEX idx_follow_ups_lead       ON follow_ups (lead_id, due_at);
-- Daily reminder check (pg_cron job)
CREATE INDEX idx_follow_ups_today      ON follow_ups (date_trunc('day', due_at))
  WHERE completed_at IS NULL;

-- ── unsubscribes ──────────────────────────────────────────────────────────
-- Workspace-scoped unsubscribe list. Prevents future emails.
CREATE TABLE unsubscribes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email             text NOT NULL             CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  lead_id           uuid REFERENCES leads(id) ON DELETE SET NULL,
  unsubscribed_at   timestamptz NOT NULL DEFAULT now(),
  -- 'link_click' | 'manual' | 'bounce' | 'spam_complaint'
  source            text                      CHECK (source IN ('link_click', 'manual', 'bounce', 'spam_complaint')),
  UNIQUE (workspace_id, email)
);

COMMENT ON TABLE unsubscribes IS 'Opt-out list. checked before every send. Scoped per workspace.';

CREATE INDEX idx_unsubscribes_email ON unsubscribes (workspace_id, lower(email));

-- ── audit_logs ────────────────────────────────────────────────────────────
-- Immutable record of all admin/sensitive actions.
-- Written ONLY by service role. No client INSERT policy.
CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- What happened: 'member.invited', 'member.role_changed', 'campaign.cancelled', etc.
  action          text NOT NULL               CHECK (char_length(action) BETWEEN 1 AND 100),
  -- What was affected: 'workspace_member', 'campaign', 'lead', etc.
  resource_type   text                        CHECK (char_length(resource_type) <= 50),
  resource_id     uuid,
  -- Additional context as JSON
  metadata        jsonb NOT NULL DEFAULT '{}',
  -- Client IP for forensics
  ip_address      inet,
  user_agent      text                        CHECK (char_length(user_agent) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS 'Immutable admin action log. INSERT via service role only. Legal retention — never deleted.';

CREATE INDEX idx_audit_workspace ON audit_logs (workspace_id, created_at DESC);
CREATE INDEX idx_audit_actor     ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_action    ON audit_logs (workspace_id, action, created_at DESC);

-- ── Add deferred FK from emails → ai_usage_logs ───────────────────────────
-- ai_usage_logs now exists so we can add the FK back-referenced from emails.
ALTER TABLE emails
  ADD CONSTRAINT fk_emails_ai_usage
    FOREIGN KEY (ai_usage_id) REFERENCES ai_usage_logs(id) ON DELETE SET NULL;
