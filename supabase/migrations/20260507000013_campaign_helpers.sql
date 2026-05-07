-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 013: Campaign helper functions
-- Adds advisory lock functions for the queue processor,
-- campaign stats increment RPC, and email status enum extension.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Advisory lock helpers (prevent duplicate queue processing runs) ───────
-- Uses a fixed bigint lock ID so the queue processor can never run twice.
-- Called from the process-email-queue Edge Function.

CREATE OR REPLACE FUNCTION try_acquire_send_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- pg_try_advisory_lock returns true if lock was acquired, false if held
  RETURN pg_try_advisory_lock(1234567890);
END;
$$;

CREATE OR REPLACE FUNCTION release_send_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM pg_advisory_unlock(1234567890);
END;
$$;

COMMENT ON FUNCTION try_acquire_send_lock IS 'Acquire session-level advisory lock for queue processor. Returns false if already held.';
COMMENT ON FUNCTION release_send_lock    IS 'Release the queue processor advisory lock.';

-- ── Campaign sent-count increment ────────────────────────────────────────
-- Called after each successful send to keep denormalized stats up to date
-- without a full COUNT() query on the emails table.

CREATE OR REPLACE FUNCTION increment_campaign_sent(p_campaign_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE campaigns
  SET    emails_sent = emails_sent + 1,
         updated_at  = now()
  WHERE  id = p_campaign_id;
$$;

-- Variants for other event types (called from webhook handler)
CREATE OR REPLACE FUNCTION increment_campaign_opened(p_campaign_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE campaigns SET emails_opened = emails_opened + 1, updated_at = now() WHERE id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION increment_campaign_clicked(p_campaign_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE campaigns SET emails_clicked = emails_clicked + 1, updated_at = now() WHERE id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION increment_campaign_replied(p_campaign_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE campaigns SET emails_replied = emails_replied + 1, updated_at = now() WHERE id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION increment_campaign_bounced(p_campaign_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE campaigns SET emails_bounced = emails_bounced + 1, updated_at = now() WHERE id = p_campaign_id;
$$;

-- ── Add step_number + campaign_id columns to emails if not present ────────
-- The base email_tables migration may already have these; this is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'emails' AND column_name = 'step_number') THEN
    ALTER TABLE emails ADD COLUMN step_number integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'emails' AND column_name = 'open_pixel_id') THEN
    ALTER TABLE emails ADD COLUMN open_pixel_id uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'emails' AND column_name = 'ai_personalised') THEN
    ALTER TABLE emails ADD COLUMN ai_personalised boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'emails' AND column_name = 'cancelled_at') THEN
    ALTER TABLE emails ADD COLUMN cancelled_at timestamptz;
  END IF;
END;
$$;

-- ── Add campaign_id to email_queue if not present ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'email_queue' AND column_name = 'campaign_id') THEN
    ALTER TABLE email_queue ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_email_queue_campaign ON email_queue (campaign_id) WHERE campaign_id IS NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'email_queue' AND column_name = 'last_error') THEN
    ALTER TABLE email_queue ADD COLUMN last_error text;
  END IF;
END;
$$;

-- ── Index: quickly find queued emails for a campaign's leads ──────────────
CREATE INDEX IF NOT EXISTS idx_emails_campaign_lead   ON emails (campaign_id, lead_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_campaign_step   ON emails (campaign_id, step_number) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_pixel           ON emails (open_pixel_id) WHERE open_pixel_id IS NOT NULL;

-- ── Auto-complete campaigns when all emails are sent ─────────────────────
-- Trigger: after each email status update, check if all campaign emails are done.
CREATE OR REPLACE FUNCTION check_campaign_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_campaign_id uuid;
  v_queued_count integer;
BEGIN
  v_campaign_id := COALESCE(NEW.campaign_id, OLD.campaign_id);
  IF v_campaign_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_queued_count
  FROM emails
  WHERE campaign_id = v_campaign_id
    AND status IN ('queued', 'sending');

  IF v_queued_count = 0 THEN
    UPDATE campaigns
    SET status       = 'completed',
        completed_at = now(),
        updated_at   = now()
    WHERE id = v_campaign_id
      AND status = 'running';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_completion ON emails;
CREATE TRIGGER trg_campaign_completion
  AFTER UPDATE OF status ON emails
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION check_campaign_completion();
