/**
 * lib/email/types.ts
 * Shared types for the entire email system.
 */

// ── Sending account ───────────────────────────────────────────────────────
export type SendingAccountType = 'resend' | 'smtp'
export type SendingAccountStatus = 'active' | 'error' | 'paused' | 'quota_exceeded'

export interface SendingAccount {
  id:                string
  workspace_id:      string
  name:              string
  from_email:        string
  from_name:         string
  type:              SendingAccountType
  daily_limit:       number       // default 50
  emails_sent_today: number
  quota_reset_at:    string | null
  is_active:         boolean
  last_error:        string | null
  last_tested_at:    string | null
  created_at:        string
  // vault references (never the raw secret)
  resend_key_id:     string | null  // vault.secrets id for Resend API key
  smtp_host:         string | null
  smtp_port:         number | null
  smtp_user:         string | null
  smtp_pass_id:      string | null  // vault.secrets id for SMTP password
  smtp_secure:       boolean        // true = TLS (465), false = STARTTLS (587)
}

/** Safe public version — credentials stripped */
export type SendingAccountPublic = Omit<
  SendingAccount,
  'resend_key_id' | 'smtp_pass_id'
> & {
  quota_remaining: number
  quota_percent:   number   // 0–100
}

// ── Create / Update payloads ───────────────────────────────────────────────
export interface CreateSendingAccountPayload {
  name:        string
  from_email:  string
  from_name:   string
  type:        SendingAccountType
  daily_limit: number
  // Resend
  resend_api_key?: string
  // SMTP
  smtp_host?:    string
  smtp_port?:    number
  smtp_user?:    string
  smtp_pass?:    string
  smtp_secure?:  boolean
}

export interface UpdateSendingAccountPayload {
  name?:        string
  from_email?:  string
  from_name?:   string
  is_active?:   boolean
  daily_limit?: number
  resend_api_key?: string   // re-encrypt on update
  smtp_host?:    string
  smtp_port?:    number
  smtp_user?:    string
  smtp_pass?:    string
  smtp_secure?:  boolean
}

// ── Email ─────────────────────────────────────────────────────────────────
export type EmailStatus =
  | 'queued' | 'sending' | 'sent' | 'failed'
  | 'bounced' | 'opened' | 'clicked' | 'replied' | 'spam_complaint'

export interface EmailRecord {
  id:                    string
  workspace_id:          string
  lead_id:               string
  sending_account_id:    string
  sent_by:               string | null
  subject:               string
  body_html:             string
  body_text:             string | null
  status:                EmailStatus
  resend_message_id:     string | null
  tracking_pixel_id:     string
  unsubscribe_token:     string
  scheduled_for:         string | null
  sent_at:               string | null
  opened_at:             string | null
  clicked_at:            string | null
  replied_at:            string | null
  bounced_at:            string | null
  bounce_reason:         string | null
  created_at:            string
}

// ── Send email request ────────────────────────────────────────────────────
export interface SendEmailRequest {
  lead_id:             string
  sending_account_id:  string
  subject:             string
  body_html:           string
  scheduled_for?:      string    // ISO string, null = send now
}

// ── Merge variables ────────────────────────────────────────────────────────
export interface MergeVariableContext {
  first_name:   string
  last_name:    string
  full_name:    string
  company:      string
  title:        string
  email:        string
  sender_name:  string
  sender_email: string
  [key: string]: string
}

// ── Quota ─────────────────────────────────────────────────────────────────
export interface QuotaStatus {
  account_id:    string
  account_name:  string
  daily_limit:   number
  sent_today:    number
  remaining:     number
  percent_used:  number    // 0–100
  at_limit:      boolean
  reset_at:      string | null
}

// ── Webhook event (Resend) ────────────────────────────────────────────────
export interface ResendWebhookEvent {
  type: 'email.sent' | 'email.delivered' | 'email.opened' | 'email.clicked'
      | 'email.bounced' | 'email.spam_complaint'
  data: {
    email_id?:   string
    message_id?: string
    to?:         string[]
    from?:       string
    subject?:    string
    bounce?:     { message?: string }
    click?:      { link?: string }
  }
  created_at: string
}

// ── Suppression check result ───────────────────────────────────────────────
export interface SuppressionResult {
  suppressed:  boolean
  reason?:     'unsubscribed' | 'do_not_contact' | 'bounced' | 'spam_complaint'
  email?:      string
}
