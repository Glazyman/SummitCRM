export type NotificationType =
  | 'reply_received'
  | 'bounce'
  | 'campaign_complete'
  | 'quota_warning'
  | 'follow_up_due'
  | 'lead_assigned'
  | 'ai_budget_warning'
  | 'ai_budget_critical'
  | 'ai_batch_complete'
  | 'member_invited'
  | 'system'

export interface Notification {
  id:          string
  workspace_id: string
  user_id:     string
  type:        NotificationType
  title:       string
  body:        string | null
  link:        string | null
  is_read:     boolean
  lead_id:     string | null
  email_id:    string | null
  campaign_id: string | null
  created_at:  string
}

export interface NotificationPreference {
  type:         NotificationType
  in_app:       boolean
  email_digest: boolean
}

export interface NotificationMeta {
  label:       string
  description: string
  color:       string
  bgColor:     string
  icon:        string
}

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  reply_received:    { label: 'Reply received',    description: 'When a lead replies to your email',       color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/40', icon: '↩' },
  bounce:            { label: 'Email bounced',     description: 'When an email bounces',                   color: 'text-red-600',     bgColor: 'bg-red-50 dark:bg-red-950/40',       icon: '⚠' },
  campaign_complete: { label: 'Campaign complete', description: 'When a campaign finishes sending',        color: 'text-blue-600',    bgColor: 'bg-blue-50 dark:bg-blue-950/40',     icon: '✓' },
  quota_warning:     { label: 'Quota warning',     description: 'When a sending account hits 80% quota',  color: 'text-orange-600',  bgColor: 'bg-orange-50 dark:bg-orange-950/40', icon: '⚡' },
  follow_up_due:     { label: 'Follow-up due',     description: 'When a scheduled follow-up is due',      color: 'text-violet-600',  bgColor: 'bg-violet-50 dark:bg-violet-950/40', icon: '📅' },
  lead_assigned:     { label: 'Lead assigned',     description: 'When a lead is assigned to you',         color: 'text-sky-600',     bgColor: 'bg-sky-50 dark:bg-sky-950/40',       icon: '👤' },
  ai_budget_warning: { label: 'AI budget warning', description: 'When AI token usage hits 80% of budget', color: 'text-amber-600',   bgColor: 'bg-amber-50 dark:bg-amber-950/40',   icon: '🤖' },
  ai_budget_critical:{ label: 'AI budget critical',description: 'When AI token budget is exhausted',      color: 'text-red-600',     bgColor: 'bg-red-50 dark:bg-red-950/40',       icon: '🤖' },
  ai_batch_complete: { label: 'AI batch done',     description: 'When a batch AI job completes',          color: 'text-indigo-600',  bgColor: 'bg-indigo-50 dark:bg-indigo-950/40', icon: '✨' },
  member_invited:    { label: 'Member invited',    description: 'When a new member joins your workspace', color: 'text-teal-600',    bgColor: 'bg-teal-50 dark:bg-teal-950/40',     icon: '👋' },
  system:            { label: 'System',            description: 'Platform announcements',                 color: 'text-slate-600',   bgColor: 'bg-slate-50 dark:bg-slate-900/40',   icon: 'ℹ' },
}
