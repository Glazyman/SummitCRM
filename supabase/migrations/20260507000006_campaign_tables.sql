-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 006: Campaign Tables
-- campaigns, campaign_sequence_steps.
-- Also adds deferred FK constraints to emails referencing these tables.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── campaigns ─────────────────────────────────────────────────────────────
-- A campaign is a named sending run targeting a lead batch.
-- May have one or more sequence steps (multi-step drip).
CREATE TABLE campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by            uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name                  text NOT NULL           CHECK (char_length(name) BETWEEN 1 AND 200),
  description           text                    CHECK (char_length(description) <= 1000),
  batch_id              uuid REFERENCES lead_batches(id) ON DELETE SET NULL,
  sending_account_id    uuid REFERENCES sending_accounts(id) ON DELETE SET NULL,

  status                campaign_status NOT NULL DEFAULT 'draft',
  scheduled_start       timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz,
  paused_at             timestamptz,

  -- ── Denormalized stats ─────────────────────────────────────────────────
  -- Updated by the queue processor on each email event.
  -- Avoids COUNT() aggregates on large emails table for list views.
  total_leads           integer NOT NULL DEFAULT 0   CHECK (total_leads >= 0),
  emails_sent           integer NOT NULL DEFAULT 0   CHECK (emails_sent >= 0),
  emails_opened         integer NOT NULL DEFAULT 0   CHECK (emails_opened >= 0),
  emails_clicked        integer NOT NULL DEFAULT 0   CHECK (emails_clicked >= 0),
  emails_replied        integer NOT NULL DEFAULT 0   CHECK (emails_replied >= 0),
  emails_bounced        integer NOT NULL DEFAULT 0   CHECK (emails_bounced >= 0),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- A campaign can only be started if it has a batch and a sending account
  CONSTRAINT campaign_started_requires_batch CHECK (
    status = 'draft' OR batch_id IS NOT NULL
  ),
  CONSTRAINT campaign_started_requires_account CHECK (
    status = 'draft' OR sending_account_id IS NOT NULL
  )
);

COMMENT ON TABLE campaigns IS 'Bulk email campaign targeting a lead batch. Can be multi-step.';
COMMENT ON COLUMN campaigns.total_leads IS 'Snapshot at launch time — does not change if batch grows.';
COMMENT ON COLUMN campaigns.emails_sent IS 'Incremented by queue processor on each successful send.';

CREATE INDEX idx_campaigns_workspace ON campaigns (workspace_id);
CREATE INDEX idx_campaigns_status    ON campaigns (workspace_id, status);
CREATE INDEX idx_campaigns_created   ON campaigns (workspace_id, created_at DESC);
-- Find campaigns using a specific batch (for batch deletion guard)
CREATE INDEX idx_campaigns_batch     ON campaigns (batch_id) WHERE batch_id IS NOT NULL;

-- ── campaign_sequence_steps ───────────────────────────────────────────────
-- Each step in a multi-email sequence. Step 1 sends immediately;
-- subsequent steps delay N days after the previous step.
CREATE TABLE campaign_sequence_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_number       integer NOT NULL              CHECK (step_number BETWEEN 1 AND 20),
  subject_template  text NOT NULL                 CHECK (char_length(subject_template) BETWEEN 1 AND 500),
  -- Body with merge variables: {{first_name}}, {{company}}, etc.
  body_template     text NOT NULL,
  -- Days to wait after the previous step (0 = same as previous, i.e. send immediately for step 1)
  delay_days        integer NOT NULL DEFAULT 0    CHECK (delay_days BETWEEN 0 AND 365),
  use_ai            boolean NOT NULL DEFAULT false,
  -- 'professional' | 'casual' | 'direct' | 'friendly'
  ai_tone           text NOT NULL DEFAULT 'professional'
                    CHECK (ai_tone IN ('professional', 'casual', 'direct', 'friendly')),
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, step_number)
);

COMMENT ON TABLE campaign_sequence_steps IS 'Ordered steps in a drip campaign. step_number 1 is the initial email.';

CREATE INDEX idx_steps_campaign ON campaign_sequence_steps (campaign_id, step_number);

-- ── Back-fill FKs on emails ───────────────────────────────────────────────
-- campaigns and campaign_sequence_steps now exist, so we can add the
-- foreign key constraints that were deferred in migration 005.
ALTER TABLE emails
  ADD CONSTRAINT fk_emails_campaign
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_emails_sequence_step
    FOREIGN KEY (sequence_step_id) REFERENCES campaign_sequence_steps(id) ON DELETE SET NULL;
