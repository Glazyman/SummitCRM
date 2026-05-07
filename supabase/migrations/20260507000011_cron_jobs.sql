-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 011: pg_cron Scheduled Jobs
-- Automated background tasks. Requires pg_cron extension (migration 001).
-- NOTE: These are applied to the cron schema, not public.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Reset sending quotas at midnight UTC ────────────────────────────────
-- Resets emails_sent_today = 0 for all accounts whose quota_reset_at < today.
SELECT cron.schedule(
  'reset-sending-quotas',          -- job name (unique identifier)
  '0 0 * * *',                     -- midnight UTC, every day
  $$ SELECT reset_all_quotas(); $$
);

-- ── 2. Process email queue every 2 minutes ────────────────────────────────
-- Calls the Edge Function that picks up ready queue items and sends them.
-- Replace YOUR_PROJECT_REF with actual Supabase project ref.
SELECT cron.schedule(
  'process-email-queue',
  '*/2 * * * *',  -- every 2 minutes
  $$
    SELECT
      net.http_post(
        url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-email-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
        ),
        body := '{}'::jsonb
      );
  $$
);

-- ── 3. Send daily digest notifications at 8am UTC ─────────────────────────
SELECT cron.schedule(
  'send-daily-digest',
  '0 8 * * *',  -- 8am UTC = 4am ET, 9am UK, etc.
  $$
    SELECT
      net.http_post(
        url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-digest',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
        ),
        body := '{}'::jsonb
      );
  $$
);

-- ── 4. Send follow-up reminders at 9am UTC ────────────────────────────────
SELECT cron.schedule(
  'send-followup-reminders',
  '0 9 * * *',  -- 9am UTC daily
  $$
    SELECT
      net.http_post(
        url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-followup-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
        ),
        body := '{}'::jsonb
      );
  $$
);

-- ── 5. Clean up expired AI cache entries daily at 2am UTC ─────────────────
SELECT cron.schedule(
  'cleanup-ai-cache',
  '0 2 * * *',
  $$ SELECT cleanup_ai_cache(); $$
);

-- ── 6. Clean up old read notifications weekly ─────────────────────────────
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * 0',  -- 3am UTC every Sunday
  $$ SELECT cleanup_old_notifications(); $$
);

-- ── 7. Release stale email_queue locks every 10 minutes ───────────────────
-- If a worker crashed while holding a lock, release it after 10 minutes.
SELECT cron.schedule(
  'release-stale-queue-locks',
  '*/10 * * * *',
  $$
    UPDATE email_queue
    SET locked_at = NULL, locked_by = NULL
    WHERE locked_at IS NOT NULL
      AND locked_at < now() - INTERVAL '10 minutes';
  $$
);
