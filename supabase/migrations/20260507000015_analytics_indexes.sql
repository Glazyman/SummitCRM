-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 015: Analytics performance indexes
-- All analytics queries scope on workspace_id + sent_at + status.
-- These covering indexes eliminate full-table scans at scale.
-- ═══════════════════════════════════════════════════════════════════════════

-- Primary analytics covering index: workspace_id, sent_at, status
-- Used by time-series, email-metrics, and rep-level queries
CREATE INDEX IF NOT EXISTS idx_emails_analytics
  ON emails (workspace_id, sent_at, status)
  WHERE sent_at IS NOT NULL;

-- Batch-scoped queries
CREATE INDEX IF NOT EXISTS idx_emails_batch_analytics
  ON emails (workspace_id, batch_id, sent_at, status)
  WHERE sent_at IS NOT NULL;

-- Rep-scoped queries
CREATE INDEX IF NOT EXISTS idx_emails_rep_analytics
  ON emails (workspace_id, sent_by, sent_at, status)
  WHERE sent_at IS NOT NULL;

-- Lead funnel: GROUP BY status scans
CREATE INDEX IF NOT EXISTS idx_leads_workspace_status
  ON leads (workspace_id, status)
  WHERE deleted_at IS NULL;

-- Campaign comparison: ordered list with analytics columns
CREATE INDEX IF NOT EXISTS idx_campaigns_analytics
  ON campaigns (workspace_id, started_at DESC)
  WHERE started_at IS NOT NULL;
