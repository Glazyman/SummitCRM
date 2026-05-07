/**
 * Campaign system types.
 * Mirrors the `campaigns` and `campaign_sequence_steps` Postgres tables.
 */

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'

export type AiTone = 'professional' | 'casual' | 'direct' | 'friendly'

// ── DB row types ──────────────────────────────────────────────────────────

export interface Campaign {
  id:                  string
  workspace_id:        string
  created_by:          string
  name:                string
  description:         string | null
  batch_id:            string | null
  sending_account_id:  string | null
  status:              CampaignStatus
  scheduled_start:     string | null   // ISO
  started_at:          string | null
  completed_at:        string | null
  paused_at:           string | null
  total_leads:         number
  emails_sent:         number
  emails_opened:       number
  emails_clicked:      number
  emails_replied:      number
  emails_bounced:      number
  created_at:          string
  updated_at:          string
}

export interface CampaignStep {
  id:               string
  campaign_id:      string
  step_number:      number
  subject_template: string
  body_template:    string
  delay_days:       number
  use_ai:           boolean
  ai_tone:          AiTone
  created_at:       string
}

// ── API payloads ──────────────────────────────────────────────────────────

export interface CreateStepPayload {
  step_number:      number
  subject_template: string
  body_template:    string
  delay_days:       number
  use_ai?:          boolean
  ai_tone?:         AiTone
}

export interface CreateCampaignPayload {
  name:               string
  description?:       string
  batch_id:           string
  sending_account_id: string
  scheduled_start?:   string | null
  steps:              CreateStepPayload[]
}

export interface UpdateCampaignPayload {
  name?:               string
  description?:        string
  batch_id?:           string
  sending_account_id?: string
  scheduled_start?:    string | null
  steps?:              CreateStepPayload[]
}

// ── Campaign detail (with steps + batch info) ─────────────────────────────

export interface CampaignWithSteps extends Campaign {
  steps:        CampaignStep[]
  batch_name:   string | null
  batch_leads:  number | null    // current lead count in batch
  account_name: string | null
  account_email:string | null
}

// ── Campaign analytics ─────────────────────────────────────────────────────

export interface CampaignAnalytics {
  total_leads:     number
  total_emails:    number
  sent:            number
  failed:          number
  queued:          number
  open_rate:       number   // 0–100
  click_rate:      number
  reply_rate:      number
  bounce_rate:     number
  unsubscribe_rate:number
  by_step: Array<{
    step_number: number
    subject:     string
    sent:        number
    opened:      number
    clicked:     number
    replied:     number
    bounced:     number
  }>
  by_day: Array<{
    date:  string
    sent:  number
    opens: number
  }>
}

// ── Per-lead email row (for the Emails tab) ───────────────────────────────

export interface CampaignEmailRow {
  email_id:    string
  lead_id:     string
  lead_name:   string | null
  lead_email:  string
  step_number: number
  subject:     string
  status:      string
  sent_at:     string | null
  opened_at:   string | null
  clicked_at:  string | null
  replied_at:  string | null
  bounced_at:  string | null
}

// ── Queue row ─────────────────────────────────────────────────────────────
export interface EmailQueueRow {
  id:                 string
  email_id:           string
  campaign_id:        string | null
  sending_account_id: string
  scheduled_for:      string
  attempts:           number
  locked_at:          string | null
  last_error:         string | null
}
