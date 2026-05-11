// ─────────────────────────────────────────────────────────────────────────────
// Database types — mirrors the Supabase schema exactly.
// Run `supabase gen types typescript --local > types/database.ts` to regenerate
// after schema changes. Manual types are here until the CLI is configured.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'super_admin' | 'admin' | 'rep'

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

export type NotificationType =
  | 'follow_up_due'
  | 'mention'
  | 'lead_assigned'

export type ActivityType =
  | 'lead_created'
  | 'lead_imported'
  | 'lead_status_changed'
  | 'lead_assigned'
  | 'interest_status_changed'
  | 'call_logged'
  | 'note_added'
  | 'follow_up_scheduled'
  | 'follow_up_sent'
  | 'member_invited'
  | 'member_removed'
  | 'role_changed'

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

// ─── Supabase Database type (for typed client) ───────────────────────────────

export type Database = {
  public: {
    Tables: {
      workspaces:        { Row: Workspace;       Insert: Partial<Workspace>;       Update: Partial<Workspace> }
      workspace_members: { Row: WorkspaceMember; Insert: Partial<WorkspaceMember>; Update: Partial<WorkspaceMember> }
      invitations:       { Row: Invitation;      Insert: Partial<Invitation>;      Update: Partial<Invitation> }
      leads:             { Row: Lead;            Insert: Partial<Lead>;            Update: Partial<Lead> }
      lead_batches:      { Row: LeadBatch;       Insert: Partial<LeadBatch>;       Update: Partial<LeadBatch> }
      lead_imports:      { Row: LeadImport;      Insert: Partial<LeadImport>;      Update: Partial<LeadImport> }
      notes:             { Row: Note;            Insert: Partial<Note>;            Update: Partial<Note> }
      activity_logs:     { Row: ActivityLog;     Insert: Partial<ActivityLog>;     Update: Partial<ActivityLog> }
      notifications:     { Row: Notification;    Insert: Partial<Notification>;    Update: Partial<Notification> }
      ai_usage_logs:     { Row: AiUsageLog;      Insert: Partial<AiUsageLog>;      Update: Partial<AiUsageLog> }
      follow_ups:        { Row: FollowUp;        Insert: Partial<FollowUp>;        Update: Partial<FollowUp> }
      tags:              { Row: Tag;             Insert: Partial<Tag>;             Update: Partial<Tag> }
      lead_tags:         { Row: LeadTag;         Insert: Partial<LeadTag>;         Update: Partial<LeadTag> }
      call_logs:         { Row: CallLog;         Insert: Partial<CallLog>;         Update: Partial<CallLog> }
      pipeline_stages:   { Row: PipelineStage;   Insert: Partial<PipelineStage>;   Update: Partial<PipelineStage> }
    }
    Views: Record<string, never>
    Functions: {
      get_my_role:                  { Args: { ws_id: string }; Returns: WorkspaceRole }
      seed_default_pipeline_stages: { Args: { p_workspace_id: string }; Returns: void }
    }
    Enums: {
      workspace_role:    WorkspaceRole
      lead_status:       LeadStatus
      interest_status:   InterestStatus
      notification_type: NotificationType
      activity_type:     ActivityType
      call_outcome:      CallOutcome
    }
  }
}
