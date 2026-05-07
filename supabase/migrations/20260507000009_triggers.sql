-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009: Triggers
-- Automatic updated_at maintenance, lead_count denormalization,
-- cascade status updates, and data integrity enforcement.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── updated_at trigger function ───────────────────────────────────────────
-- Single function reused across all tables that have updated_at.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lead_batches_updated_at
  BEFORE UPDATE ON lead_batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sending_accounts_updated_at
  BEFORE UPDATE ON sending_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── lead_count denormalization ────────────────────────────────────────────
-- Keeps lead_batches.lead_count in sync without requiring COUNT(*) queries.
CREATE OR REPLACE FUNCTION sync_lead_batch_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Handle INSERT: increment count for the new batch
  IF TG_OP = 'INSERT' AND NEW.batch_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE lead_batches
    SET lead_count = lead_count + 1,
        updated_at = now()
    WHERE id = NEW.batch_id;

  -- Handle DELETE or soft-delete: decrement count
  ELSIF TG_OP = 'UPDATE' THEN
    -- Lead was soft-deleted (deleted_at went from NULL to a timestamp)
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NEW.batch_id IS NOT NULL THEN
      UPDATE lead_batches
      SET lead_count = GREATEST(lead_count - 1, 0),
          updated_at = now()
      WHERE id = NEW.batch_id;
    END IF;

    -- Lead was moved to a different batch
    IF OLD.batch_id IS DISTINCT FROM NEW.batch_id THEN
      IF OLD.batch_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
        UPDATE lead_batches
        SET lead_count = GREATEST(lead_count - 1, 0),
            updated_at = now()
        WHERE id = OLD.batch_id;
      END IF;
      IF NEW.batch_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
        UPDATE lead_batches
        SET lead_count = lead_count + 1,
            updated_at = now()
        WHERE id = NEW.batch_id;
      END IF;
    END IF;

  -- Handle hard DELETE
  ELSIF TG_OP = 'DELETE' AND OLD.batch_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE lead_batches
    SET lead_count = GREATEST(lead_count - 1, 0),
        updated_at = now()
    WHERE id = OLD.batch_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_leads_batch_count
  AFTER INSERT OR UPDATE OF batch_id, deleted_at OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_lead_batch_count();

-- ── Unsubscribe cascade on lead status change ─────────────────────────────
-- When a lead's status is set to 'unsubscribed' or 'do_not_contact',
-- ensure the unsubscribes table is also populated.
CREATE OR REPLACE FUNCTION sync_lead_unsubscribe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark lead as unsubscribed and insert into unsubscribes list
  IF NEW.status IN ('unsubscribed', 'do_not_contact')
    AND (OLD.status IS DISTINCT FROM NEW.status
         OR OLD.is_unsubscribed IS DISTINCT FROM NEW.is_unsubscribed) THEN

    -- Upsert into unsubscribes (idempotent)
    INSERT INTO unsubscribes (workspace_id, email, lead_id, source)
    VALUES (NEW.workspace_id, lower(NEW.email), NEW.id, 'manual')
    ON CONFLICT (workspace_id, email) DO NOTHING;

    -- Keep is_unsubscribed flag in sync
    NEW.is_unsubscribed := true;
    NEW.unsubscribed_at := COALESCE(NEW.unsubscribed_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_unsubscribe_sync
  BEFORE UPDATE OF status, is_unsubscribed ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_lead_unsubscribe();

-- ── Campaign stats denormalization ────────────────────────────────────────
-- Increment campaign counters when email status changes.
-- This avoids COUNT() aggregations on large emails table.
CREATE OR REPLACE FUNCTION sync_campaign_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process emails that belong to a campaign
  IF NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- emails_sent: transition to 'sent'
  IF OLD.status != 'sent' AND NEW.status = 'sent' THEN
    UPDATE campaigns
    SET emails_sent = emails_sent + 1, updated_at = now()
    WHERE id = NEW.campaign_id;

  -- emails_opened: transition to 'opened' (only count first open)
  ELSIF OLD.status NOT IN ('opened', 'clicked') AND NEW.status = 'opened' THEN
    UPDATE campaigns
    SET emails_opened = emails_opened + 1, updated_at = now()
    WHERE id = NEW.campaign_id;

  -- emails_clicked: transition to 'clicked' (only count first click)
  ELSIF OLD.status NOT IN ('clicked') AND NEW.status = 'clicked' THEN
    UPDATE campaigns
    SET emails_clicked = emails_clicked + 1, updated_at = now()
    WHERE id = NEW.campaign_id;

  -- emails_replied
  ELSIF OLD.status != 'replied' AND NEW.status = 'replied' THEN
    UPDATE campaigns
    SET emails_replied = emails_replied + 1, updated_at = now()
    WHERE id = NEW.campaign_id;

  -- emails_bounced
  ELSIF OLD.status != 'bounced' AND NEW.status = 'bounced' THEN
    UPDATE campaigns
    SET emails_bounced = emails_bounced + 1, updated_at = now()
    WHERE id = NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_emails_campaign_stats
  AFTER UPDATE OF status ON emails
  FOR EACH ROW EXECUTE FUNCTION sync_campaign_stats();

-- ── Prevent updates to audit_logs ─────────────────────────────────────────
-- audit_logs must be immutable. Raise an error if anyone tries to modify them.
CREATE OR REPLACE FUNCTION deny_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable and cannot be modified or deleted.';
END;
$$;

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION deny_audit_log_mutation();

-- ── Prevent updates to activity_logs ─────────────────────────────────────
CREATE OR REPLACE FUNCTION deny_activity_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'activity_logs are append-only and cannot be modified.';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'activity_logs are append-only and cannot be deleted.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_activity_logs_immutable
  BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION deny_activity_log_mutation();

-- ── Auto-expire ai_draft_cache ────────────────────────────────────────────
-- Cleanup function called by pg_cron daily. Removes expired cache entries.
CREATE OR REPLACE FUNCTION cleanup_ai_cache()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM ai_draft_cache WHERE expires_at < now();
$$;

-- ── Auto-expire old notifications ─────────────────────────────────────────
-- Remove read notifications older than 90 days to control table size.
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM notifications
  WHERE is_read = true
    AND created_at < now() - INTERVAL '90 days';
$$;
