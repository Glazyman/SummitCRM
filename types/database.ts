// ─────────────────────────────────────────────────────────────────────────────
// Database types — mirrors the Supabase schema exactly.
// Run `supabase gen types typescript --local > types/database.ts` to regenerate
// after schema changes. Manual types are here until the CLI is configured.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'super_admin' | 'admin' | 'manager' | 'rep' | 'viewer'

export type LeadStatus =
  | 'new'
  | 'called'
  | 'emailed'
  | 'voicemail'
  | 'no_answer'
  | 'wrong_number'
  | 'sold_already'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'not_interested'
  | 'do_not_contact'
  | 'unsubscribed'
  | 'converted'

export type InterestStatus = 'pending' | 'interested' | 'not_interested'

export type CallOutcome =
  | 'answered'
  | 'voicemail'
  | 'no_answer'
  | 'wrong_number'
  | 'callback_requested'

export type EmailStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'bounced'
  | 'opened'
  | 'clicked'
  | 'replied'

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'

export type NotificationType =
  | 'reply_received'
  | 'bounce'
  | 'campaign_complete'
  | 'quota_warning'
  | 'follow_up_due'
  | 'mention'
  | 'lead_assigned'

export type ActivityType =
  | 'lead_created'
  | 'lead_imported'
  | 'lead_status_changed'
  | 'note_added'
  | 'email_sent'
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'email_bounced'
  | 'campaign_started'
  | 'campaign_completed'
  | 'ai_draft_generated'
  | 'follow_up_scheduled'
  | 'follow_up_sent'
  | 'unsubscribed'
  | 'member_invited'
  | 'member_removed'
  | 'role_changed'

export type SendingAccountType = 'resend' | 'smtp'

// ─── Row types ───────────────────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  slug: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  invited_by: string | null
  joined_at: string | null
  is_active: boolean
  created_at: string
}

export interface Invitation {
  id: string
  workspace_id: string
  email: string
  role: WorkspaceRole
  token: string
  invited_by: string
  accepted_at: string | null
  expires_at: string
  created_at: string
}

export interface Lead {
  id: string
  workspace_id: string
  assigned_to: string | null
  batch_id: string | null
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  title: string | null
  company: string | null
  website: string | null
  linkedin_url: string | null
  status: LeadStatus
  interest_status: InterestStatus
  pipeline_stage_id: string | null
  is_unsubscribed: boolean
  unsubscribed_at: string | null
  custom_fields: Record<string, unknown>
  ai_summary: string | null
  source: string | null
  import_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  workspace_id: string
  name: string
  color: string
  created_by: string | null
  created_at: string
}

export interface LeadTag {
  lead_id: string
  tag_id: string
  created_at: string
}

export interface CallLog {
  id: string
  workspace_id: string
  lead_id: string
  logged_by: string
  outcome: CallOutcome
  duration_sec: number | null
  notes: string | null
  called_at: string
  created_at: string
}

export interface PipelineStage {
  id: string
  workspace_id: string
  name: string
  color: string
  position: number
  is_won: boolean
  is_lost: boolean
  created_at: string
  updated_at: string
}

export interface LeadBatch {
  id: string
  workspace_id: string
  name: string
  description: string | null
  created_by: string
  lead_count: number
  created_at: string
  updated_at: string
}

export interface LeadImport {
  id: string
  workspace_id: string
  created_by: string
  file_name: string
  storage_path: string
  total_rows: number | null
  imported_rows: number | null
  failed_rows: number | null
  field_mapping: Record<string, string>
  status: 'processing' | 'complete' | 'failed'
  error_log: unknown | null
  created_at: string
  completed_at: string | null
}

export interface Note {
  id: string
  workspace_id: string
  lead_id: string
  author_id: string
  content: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface SendingAccount {
  id: string
  workspace_id: string
  name: string
  from_email: string
  from_name: string | null
  type: SendingAccountType
  resend_api_key_encrypted: string | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_pass_encrypted: string | null
  smtp_secure: boolean
  daily_limit: number
  emails_sent_today: number
  quota_reset_at: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Email {
  id: string
  workspace_id: string
  lead_id: string
  sending_account_id: string
  campaign_id: string | null
  sequence_step_id: string | null
  sent_by: string | null
  subject: string
  body_html: string
  body_text: string | null
  status: EmailStatus
  scheduled_for: string | null
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  replied_at: string | null
  bounced_at: string | null
  bounce_reason: string | null
  tracking_pixel_id: string
  resend_message_id: string | null
  is_ai_generated: boolean
  ai_usage_id: string | null
  created_at: string
}

export interface Campaign {
  id: string
  workspace_id: string
  created_by: string
  name: string
  description: string | null
  batch_id: string | null
  sending_account_id: string | null
  status: CampaignStatus
  scheduled_start: string | null
  started_at: string | null
  completed_at: string | null
  total_leads: number
  emails_sent: number
  emails_opened: number
  emails_clicked: number
  emails_replied: number
  emails_bounced: number
  created_at: string
  updated_at: string
}

export interface CampaignSequenceStep {
  id: string
  campaign_id: string
  step_number: number
  subject_template: string
  body_template: string
  delay_days: number
  use_ai: boolean
  ai_tone: string
  created_at: string
}

export interface ActivityLog {
  id: string
  workspace_id: string
  lead_id: string | null
  user_id: string | null
  type: ActivityType
  metadata: Record<string, unknown>
  created_at: string
}

export interface Notification {
  id: string
  workspace_id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  lead_id: string | null
  email_id: string | null
  campaign_id: string | null
  created_at: string
}

export interface AiUsageLog {
  id: string
  workspace_id: string
  user_id: string | null
  model: string
  task: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd: number | null
  lead_id: string | null
  campaign_id: string | null
  created_at: string
}

export interface FollowUp {
  id: string
  workspace_id: string
  lead_id: string
  assigned_to: string | null
  title: string
  notes: string | null
  due_at: string
  completed_at: string | null
  is_ai_suggested: boolean
  created_at: string
}

export interface Unsubscribe {
  id: string
  workspace_id: string
  email: string
  lead_id: string | null
  unsubscribed_at: string
  source: string | null
}

// ─── Supabase Database type (for typed client) ───────────────────────────────

export type Database = {
  public: {
    Tables: {
      workspaces: { Row: Workspace; Insert: Partial<Workspace>; Update: Partial<Workspace> }
      workspace_members: { Row: WorkspaceMember; Insert: Partial<WorkspaceMember>; Update: Partial<WorkspaceMember> }
      invitations: { Row: Invitation; Insert: Partial<Invitation>; Update: Partial<Invitation> }
      leads: { Row: Lead; Insert: Partial<Lead>; Update: Partial<Lead> }
      lead_batches: { Row: LeadBatch; Insert: Partial<LeadBatch>; Update: Partial<LeadBatch> }
      lead_imports: { Row: LeadImport; Insert: Partial<LeadImport>; Update: Partial<LeadImport> }
      notes: { Row: Note; Insert: Partial<Note>; Update: Partial<Note> }
      sending_accounts: { Row: SendingAccount; Insert: Partial<SendingAccount>; Update: Partial<SendingAccount> }
      emails: { Row: Email; Insert: Partial<Email>; Update: Partial<Email> }
      campaigns: { Row: Campaign; Insert: Partial<Campaign>; Update: Partial<Campaign> }
      campaign_sequence_steps: { Row: CampaignSequenceStep; Insert: Partial<CampaignSequenceStep>; Update: Partial<CampaignSequenceStep> }
      activity_logs: { Row: ActivityLog; Insert: Partial<ActivityLog>; Update: Partial<ActivityLog> }
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> }
      ai_usage_logs: { Row: AiUsageLog; Insert: Partial<AiUsageLog>; Update: Partial<AiUsageLog> }
      follow_ups: { Row: FollowUp; Insert: Partial<FollowUp>; Update: Partial<FollowUp> }
      unsubscribes: { Row: Unsubscribe; Insert: Partial<Unsubscribe>; Update: Partial<Unsubscribe> }
      tags: { Row: Tag; Insert: Partial<Tag>; Update: Partial<Tag> }
      lead_tags: { Row: LeadTag; Insert: Partial<LeadTag>; Update: Partial<LeadTag> }
      call_logs: { Row: CallLog; Insert: Partial<CallLog>; Update: Partial<CallLog> }
      pipeline_stages: { Row: PipelineStage; Insert: Partial<PipelineStage>; Update: Partial<PipelineStage> }
    }
    Views: Record<string, never>
    Functions: {
      get_my_role: { Args: { ws_id: string }; Returns: WorkspaceRole }
      seed_default_pipeline_stages: { Args: { p_workspace_id: string }; Returns: void }
    }
    Enums: {
      workspace_role: WorkspaceRole
      lead_status: LeadStatus
      interest_status: InterestStatus
      email_status: EmailStatus
      campaign_status: CampaignStatus
      notification_type: NotificationType
      activity_type: ActivityType
      sending_account_type: SendingAccountType
      call_outcome: CallOutcome
    }
  }
}
