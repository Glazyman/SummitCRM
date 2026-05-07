# 03 — Database Schema

## Goal
Define the complete Postgres schema for all application data, with foreign keys, indexes, enums, and RLS policy stubs.

---

## Conventions

- All primary keys: `uuid DEFAULT gen_random_uuid()`
- All tables include `created_at timestamptz DEFAULT now()`
- Tables with mutable records include `updated_at timestamptz DEFAULT now()`
- Every user-facing table has `workspace_id uuid NOT NULL REFERENCES workspaces(id)`
- Soft deletes via `deleted_at timestamptz` where applicable (leads, notes)
- RLS enabled on every table

---

## Enums

```sql
CREATE TYPE workspace_role AS ENUM ('super_admin', 'admin', 'manager', 'rep', 'viewer');

CREATE TYPE lead_status AS ENUM (
  'new', 'contacted', 'replied', 'interested',
  'not_interested', 'do_not_contact', 'unsubscribed', 'converted'
);

CREATE TYPE email_status AS ENUM (
  'queued', 'sending', 'sent', 'failed', 'bounced', 'opened', 'clicked', 'replied'
);

CREATE TYPE campaign_status AS ENUM (
  'draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'
);

CREATE TYPE notification_type AS ENUM (
  'reply_received', 'bounce', 'campaign_complete', 'quota_warning',
  'follow_up_due', 'mention', 'lead_assigned'
);

CREATE TYPE activity_type AS ENUM (
  'lead_created', 'lead_imported', 'lead_status_changed', 'note_added',
  'email_sent', 'email_opened', 'email_clicked', 'email_replied',
  'email_bounced', 'campaign_started', 'campaign_completed',
  'ai_draft_generated', 'follow_up_scheduled', 'follow_up_sent',
  'unsubscribed', 'member_invited', 'member_removed', 'role_changed'
);

CREATE TYPE sending_account_type AS ENUM ('resend', 'smtp');
```

---

## Core Tables

### `workspaces`
```sql
CREATE TABLE workspaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  settings      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
```

### `workspace_members`
```sql
CREATE TABLE workspace_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          workspace_role NOT NULL DEFAULT 'rep',
  invited_by    uuid REFERENCES auth.users(id),
  joined_at     timestamptz,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
```

### `invitations`
```sql
CREATE TABLE invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         text NOT NULL,
  role          workspace_role NOT NULL DEFAULT 'rep',
  token         text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  invited_by    uuid NOT NULL REFERENCES auth.users(id),
  accepted_at   timestamptz,
  expires_at    timestamptz DEFAULT (now() + interval '7 days'),
  created_at    timestamptz DEFAULT now()
);
```

---

## Lead Tables

### `leads`
```sql
CREATE TABLE leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assigned_to     uuid REFERENCES auth.users(id),
  batch_id        uuid REFERENCES lead_batches(id),

  -- Identity
  first_name      text,
  last_name       text,
  email           text NOT NULL,
  phone           text,
  title           text,
  company         text,
  website         text,
  linkedin_url    text,

  -- Status
  status          lead_status NOT NULL DEFAULT 'new',
  is_unsubscribed boolean DEFAULT false,
  unsubscribed_at timestamptz,

  -- Enrichment
  custom_fields   jsonb DEFAULT '{}',
  ai_summary      text,

  -- Metadata
  source          text,  -- e.g. 'csv_import', 'manual', 'api'
  import_id       uuid REFERENCES lead_imports(id),

  deleted_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_leads_workspace ON leads(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_status ON leads(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_email ON leads(workspace_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_batch ON leads(batch_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned ON leads(assigned_to) WHERE deleted_at IS NULL;
```

### `lead_batches`
```sql
CREATE TABLE lead_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  lead_count    integer DEFAULT 0,  -- denormalized for display
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
```

### `lead_imports`
```sql
CREATE TABLE lead_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  file_name       text NOT NULL,
  storage_path    text NOT NULL,  -- Supabase Storage path
  total_rows      integer,
  imported_rows   integer,
  failed_rows     integer,
  field_mapping   jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'processing',  -- processing|complete|failed
  error_log       jsonb,
  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);
```

### `notes`
```sql
CREATE TABLE notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES auth.users(id),
  content       text NOT NULL,
  deleted_at    timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_notes_lead ON notes(lead_id) WHERE deleted_at IS NULL;
```

---

## Email Tables

### `sending_accounts`
```sql
CREATE TABLE sending_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL,
  from_email      text NOT NULL,
  from_name       text,
  type            sending_account_type NOT NULL,

  -- Resend
  resend_api_key_encrypted text,  -- stored via Supabase Vault reference

  -- SMTP
  smtp_host       text,
  smtp_port       integer,
  smtp_user       text,
  smtp_pass_encrypted text,  -- stored via Supabase Vault reference
  smtp_secure     boolean DEFAULT true,

  -- Quota
  daily_limit     integer NOT NULL DEFAULT 50,
  emails_sent_today integer NOT NULL DEFAULT 0,
  quota_reset_at  date NOT NULL DEFAULT CURRENT_DATE,

  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_sending_accounts_workspace ON sending_accounts(workspace_id);
```

### `emails`
```sql
CREATE TABLE emails (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id           uuid NOT NULL REFERENCES leads(id),
  sending_account_id uuid NOT NULL REFERENCES sending_accounts(id),
  campaign_id       uuid REFERENCES campaigns(id),
  sequence_step_id  uuid REFERENCES campaign_sequence_steps(id),
  sent_by           uuid REFERENCES auth.users(id),

  subject           text NOT NULL,
  body_html         text NOT NULL,
  body_text         text,

  status            email_status NOT NULL DEFAULT 'queued',
  scheduled_for     timestamptz,
  sent_at           timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  replied_at        timestamptz,
  bounced_at        timestamptz,
  bounce_reason     text,

  -- Tracking
  tracking_pixel_id uuid DEFAULT gen_random_uuid(),
  resend_message_id text,

  is_ai_generated   boolean DEFAULT false,
  ai_usage_id       uuid REFERENCES ai_usage_logs(id),

  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_emails_workspace ON emails(workspace_id);
CREATE INDEX idx_emails_lead ON emails(lead_id);
CREATE INDEX idx_emails_campaign ON emails(campaign_id);
CREATE INDEX idx_emails_status ON emails(status, scheduled_for);
CREATE INDEX idx_emails_tracking ON emails(tracking_pixel_id);
```

### `email_queue`
```sql
CREATE TABLE email_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id),
  email_id          uuid NOT NULL REFERENCES emails(id),
  sending_account_id uuid NOT NULL REFERENCES sending_accounts(id),
  scheduled_for     timestamptz NOT NULL DEFAULT now(),
  attempts          integer DEFAULT 0,
  last_error        text,
  locked_at         timestamptz,  -- pg advisory lock timestamp
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_email_queue_scheduled ON email_queue(scheduled_for, locked_at NULLS FIRST);
```

---

## Campaign Tables

### `campaigns`
```sql
CREATE TABLE campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by          uuid NOT NULL REFERENCES auth.users(id),
  name                text NOT NULL,
  description         text,
  batch_id            uuid REFERENCES lead_batches(id),
  sending_account_id  uuid REFERENCES sending_accounts(id),
  status              campaign_status NOT NULL DEFAULT 'draft',
  scheduled_start     timestamptz,
  started_at          timestamptz,
  completed_at        timestamptz,

  -- Stats (denormalized)
  total_leads         integer DEFAULT 0,
  emails_sent         integer DEFAULT 0,
  emails_opened       integer DEFAULT 0,
  emails_clicked      integer DEFAULT 0,
  emails_replied      integer DEFAULT 0,
  emails_bounced      integer DEFAULT 0,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
```

### `campaign_sequence_steps`
```sql
CREATE TABLE campaign_sequence_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_number     integer NOT NULL,
  subject_template text NOT NULL,
  body_template   text NOT NULL,  -- merge variables: {{first_name}}, {{company}}, etc.
  delay_days      integer NOT NULL DEFAULT 0,  -- days after previous step
  use_ai          boolean DEFAULT false,
  ai_tone         text DEFAULT 'professional',
  created_at      timestamptz DEFAULT now()
);
```

---

## Activity & Notifications

### `activity_logs`
```sql
CREATE TABLE activity_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  lead_id       uuid REFERENCES leads(id),
  user_id       uuid REFERENCES auth.users(id),
  type          activity_type NOT NULL,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_activity_logs_lead ON activity_logs(lead_id, created_at DESC);
CREATE INDEX idx_activity_logs_workspace ON activity_logs(workspace_id, created_at DESC);
```

### `notifications`
```sql
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  type          notification_type NOT NULL,
  title         text NOT NULL,
  body          text,
  link          text,
  is_read       boolean DEFAULT false,
  lead_id       uuid REFERENCES leads(id),
  email_id      uuid REFERENCES emails(id),
  campaign_id   uuid REFERENCES campaigns(id),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
```

---

## AI Tables

### `ai_usage_logs`
```sql
CREATE TABLE ai_usage_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id),
  user_id         uuid REFERENCES auth.users(id),
  model           text NOT NULL,
  task            text NOT NULL,  -- e.g. 'email_personalisation', 'subject_line'
  prompt_tokens   integer NOT NULL,
  completion_tokens integer NOT NULL,
  total_tokens    integer NOT NULL,
  cost_usd        numeric(10, 6),
  lead_id         uuid REFERENCES leads(id),
  campaign_id     uuid REFERENCES campaigns(id),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_usage_workspace ON ai_usage_logs(workspace_id, created_at DESC);
```

---

## Follow-up Tables

### `follow_ups`
```sql
CREATE TABLE follow_ups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id),
  lead_id         uuid NOT NULL REFERENCES leads(id),
  assigned_to     uuid REFERENCES auth.users(id),
  title           text NOT NULL,
  notes           text,
  due_at          timestamptz NOT NULL,
  completed_at    timestamptz,
  is_ai_suggested boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_follow_ups_due ON follow_ups(assigned_to, due_at) WHERE completed_at IS NULL;
```

---

## Unsubscribe Table

### `unsubscribes`
```sql
CREATE TABLE unsubscribes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  email         text NOT NULL,
  lead_id       uuid REFERENCES leads(id),
  unsubscribed_at timestamptz DEFAULT now(),
  source        text,  -- 'link_click', 'manual', 'bounce'
  UNIQUE(workspace_id, email)
);
```

---

## Key Indexes Summary

```sql
-- Always index on workspace_id (all tables)
-- Index status columns used in filters
-- Index foreign keys used in JOINs
-- Partial indexes with WHERE deleted_at IS NULL for soft-deleted tables
-- Index on email tracking pixel ID for inbound webhooks
-- Index on email_queue scheduled_for for queue processing
```

---

## Migration Strategy

- Use Supabase CLI migrations: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
- Run `supabase db push` to apply to remote project
- Never manually edit production DB
- Each feature module owns its own migration file(s)

---

## Testing Checklist

- [ ] All tables created with correct types and constraints
- [ ] All foreign keys enforced
- [ ] All enums have correct values
- [ ] RLS enabled on all tables (verify with `SELECT * FROM pg_tables WHERE rowsecurity = true`)
- [ ] Indexes exist on all frequently queried columns
- [ ] `workspace_id` present on all user-facing tables
- [ ] `lead_imports` storage path references valid Supabase Storage bucket
- [ ] `sending_accounts` encrypted credential fields are never returned raw
- [ ] `email_queue` locked_at mechanism prevents double-send
