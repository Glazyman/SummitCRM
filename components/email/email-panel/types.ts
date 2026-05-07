/**
 * Types for the right-side Email Panel.
 */

// ── Draft ─────────────────────────────────────────────────────────────────
export interface EmailDraft {
  id:                  string
  lead_id:             string
  sending_account_id:  string
  subject:             string
  body:                string   // plain text / lightweight HTML
  saved_at:            string   // ISO string
  label?:              string   // auto-generated from subject
}

// ── Template ──────────────────────────────────────────────────────────────
export type TemplateCategory =
  | 'cold_outreach'
  | 'follow_up'
  | 'breakup'
  | 'demo_request'
  | 'value_prop'
  | 'check_in'

export interface EmailTemplate {
  id:          string
  name:        string
  description: string
  category:    TemplateCategory
  subject:     string
  body:        string
  tags:        string[]
}

// ── Panel mode ────────────────────────────────────────────────────────────
export type PanelTab = 'compose' | 'templates' | 'drafts' | 'history'

// ── Compose state ─────────────────────────────────────────────────────────
export interface ComposeState {
  accountId:   string
  subject:     string
  body:        string
  scheduleAt:  string   // ISO string, '' = send now
  preview:     boolean
}
