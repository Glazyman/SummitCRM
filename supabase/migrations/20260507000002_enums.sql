-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002: Enums
-- All domain enums used across the schema.
-- Adding values to an enum later requires `ALTER TYPE ... ADD VALUE`.
-- Reordering or removing values requires a full type replacement.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Role hierarchy (ordered lowest → highest privilege) ───────────────────
CREATE TYPE workspace_role AS ENUM (
  'viewer',      -- read-only access to assigned leads
  'rep',         -- can create/edit their own leads, send emails
  'manager',     -- can view all workspace leads, create campaigns
  'admin',       -- full workspace access, manage team and accounts
  'super_admin'  -- platform owner, all admin powers + billing
);

-- ── Lead lifecycle status ─────────────────────────────────────────────────
CREATE TYPE lead_status AS ENUM (
  'new',             -- just imported / created
  'contacted',       -- at least one email sent
  'replied',         -- lead responded
  'interested',      -- expressed interest
  'not_interested',  -- explicitly declined
  'do_not_contact',  -- must never be contacted
  'unsubscribed',    -- opted out of all emails
  'converted'        -- became a customer
);

-- ── Email delivery states ─────────────────────────────────────────────────
CREATE TYPE email_status AS ENUM (
  'queued',   -- sitting in email_queue, not yet processed
  'sending',  -- being handed off to provider
  'sent',     -- accepted by provider
  'failed',   -- provider rejected or internal error
  'bounced',  -- permanent delivery failure
  'opened',   -- tracking pixel fired
  'clicked',  -- link redirect tracked
  'replied'   -- inbound reply detected
);

-- ── Campaign lifecycle ────────────────────────────────────────────────────
CREATE TYPE campaign_status AS ENUM (
  'draft',      -- being built, not yet launched
  'scheduled',  -- will start at scheduled_start timestamp
  'running',    -- actively sending
  'paused',     -- temporarily halted
  'completed',  -- all emails sent
  'cancelled'   -- abandoned before completion
);

-- ── In-app and email notification types ──────────────────────────────────
CREATE TYPE notification_type AS ENUM (
  'reply_received',    -- lead replied to an email
  'bounce',            -- email hard-bounced
  'campaign_complete', -- campaign finished sending
  'quota_warning',     -- sending account near daily limit
  'follow_up_due',     -- a scheduled follow-up is due today
  'mention',           -- user @mentioned in a note
  'lead_assigned'      -- a lead was assigned to this user
);

-- ── Immutable activity feed event types ──────────────────────────────────
CREATE TYPE activity_type AS ENUM (
  'lead_created',
  'lead_imported',
  'lead_status_changed',
  'note_added',
  'note_edited',
  'note_deleted',
  'email_sent',
  'email_opened',
  'email_clicked',
  'email_replied',
  'email_bounced',
  'campaign_started',
  'campaign_paused',
  'campaign_resumed',
  'campaign_completed',
  'campaign_cancelled',
  'ai_draft_generated',
  'follow_up_scheduled',
  'follow_up_completed',
  'follow_up_sent',
  'unsubscribed',
  'lead_assigned',
  'member_invited',
  'member_removed',
  'member_deactivated',
  'role_changed'
);

-- ── Sending account provider type ────────────────────────────────────────
CREATE TYPE sending_account_type AS ENUM (
  'resend',  -- Resend API key
  'smtp'     -- SMTP credentials (Gmail, Outlook, etc.)
);
