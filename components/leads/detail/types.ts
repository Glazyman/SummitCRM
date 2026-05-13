/**
 * components/leads/detail/types.ts
 *
 * Types specific to the Lead Detail view.
 */
import type { LeadStatus, InterestStatus } from '@/types/database'
export type { LeadStatus, InterestStatus }

// ── Full lead detail (all fields + joined data) ──────────────────────────
export interface LeadDetail {
  id:               string
  workspace_id:     string
  first_name:       string | null
  last_name:        string | null
  email:            string
  phone:            string | null
  title:            string | null
  company:          string | null
  website:          string | null
  linkedin_url:     string | null
  status:           LeadStatus
  interest_status:  InterestStatus
  pipeline_stage_id?: string | null
  is_unsubscribed:  boolean
  batch_id:         string | null
  batch_name:       string | null
  assigned_to:      string | null
  assigned_name:    string | null
  assigned_avatar:  string | null
  ai_summary:       string | null
  custom_fields:    Record<string, string>
  created_at:       string
  updated_at:       string
}

// ── Activity timeline entry ───────────────────────────────────────────────
export type ActivityType =
  | 'lead_created'
  | 'lead_imported'
  | 'lead_status_changed'
  | 'note_added'
  | 'note_edited'
  | 'note_deleted'
  | 'email_sent'
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'email_bounced'
  | 'ai_draft_generated'
  | 'follow_up_scheduled'
  | 'follow_up_sent'
  | 'follow_up_completed'
  | 'call_logged'
  | 'unsubscribed'
  | 'member_invited'
  | 'role_changed'

export interface ActivityEntry {
  id:           string
  source:       'activity' | 'note'
  type:         ActivityType
  user_id:      string | null
  user_name:    string | null
  user_initials:string | null
  created_at:   string
  metadata:     Record<string, unknown>
  /** For note entries — full note content */
  note_id?:     string
  note_content?: string
  note_editable?: boolean  // only true if current user is author
  /** For note entries — the user this note is assigned to (the @mention recipient). */
  note_assigned_to?:      string | null
  note_assigned_to_name?: string | null
}

// ── Note ─────────────────────────────────────────────────────────────────
export interface Note {
  id:         string
  lead_id:    string
  author_id:  string
  author_name:string | null
  content:    string
  created_at: string
  updated_at: string
}

// ── Email history row ─────────────────────────────────────────────────────
export type EmailHistoryStatus =
  | 'queued' | 'sending' | 'sent' | 'failed'
  | 'bounced' | 'opened' | 'clicked' | 'replied'

export interface EmailHistoryItem {
  id:          string
  subject:     string
  body_html:   string | null
  sent_by?:    string | null
  sender_name: string | null
  status:      EmailHistoryStatus
  sent_at:     string | null
  opened_at:   string | null
  clicked_at:  string | null
  replied_at:  string | null
  bounced_at?: string | null
}

// ── Follow-up ─────────────────────────────────────────────────────────────
export interface FollowUp {
  id:            string
  title:         string
  notes:         string | null
  due_at:        string
  is_completed:  boolean
  completed_at:  string | null
  assigned_to:   string | null
  assigned_name: string | null
}

export interface NewFollowUp {
  title:       string
  notes:       string
  due_at:      string
  assigned_to: string
}

// ── Team member (for assign dropdowns) ────────────────────────────────────
export interface TeamMember {
  id:    string
  name:  string
  role?: string
}
