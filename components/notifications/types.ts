// The DB enum still carries a bunch of legacy types from the email
// era (bounce, campaign_complete, reply_received, quota_warning,
// task_reminder, unsubscribe). The product doesn't insert any of
// those anymore — listing them here would confuse the UI. Keep the
// TS type permissive so old rows still parse, but only surface the
// active ones in pickers + preference toggles.

export type NotificationType =
  | 'mention'           // a teammate assigned you a note
  | 'follow_up_due'     // scheduled follow-up reached its due time
  | 'lead_assigned'     // an admin assigned a lead to you
  // ── Legacy types kept for back-compat with existing rows ─────────
  | 'reply_received'
  | 'bounce'
  | 'campaign_complete'
  | 'quota_warning'
  | 'task_reminder'
  | 'unsubscribe'
  | 'system'

/** Active types the product currently emits. Used by filters + preferences. */
export const ACTIVE_NOTIFICATION_TYPES: NotificationType[] = [
  'mention',
  'follow_up_due',
  'lead_assigned',
]

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
  // Active
  mention:           { label: 'Note assigned',     description: 'A teammate assigned a note to you',     color: 'text-violet-600',  bgColor: 'bg-violet-50 dark:bg-violet-950/40', icon: '@' },
  follow_up_due:     { label: 'Follow-up due',     description: 'A scheduled follow-up is due',          color: 'text-amber-600',   bgColor: 'bg-amber-50 dark:bg-amber-950/40',   icon: '📅' },
  lead_assigned:     { label: 'Lead assigned',     description: 'A lead was assigned to you',            color: 'text-sky-600',     bgColor: 'bg-sky-50 dark:bg-sky-950/40',       icon: '👤' },
  // Legacy — never inserted today, but old rows may exist
  reply_received:    { label: 'Reply received',    description: '(legacy)',                              color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/40', icon: '↩' },
  bounce:            { label: 'Email bounced',     description: '(legacy)',                              color: 'text-red-600',     bgColor: 'bg-red-50 dark:bg-red-950/40',       icon: '⚠' },
  campaign_complete: { label: 'Campaign complete', description: '(legacy)',                              color: 'text-blue-600',    bgColor: 'bg-blue-50 dark:bg-blue-950/40',     icon: '✓' },
  quota_warning:     { label: 'Quota warning',     description: '(legacy)',                              color: 'text-orange-600',  bgColor: 'bg-orange-50 dark:bg-orange-950/40', icon: '⚡' },
  task_reminder:     { label: 'Task reminder',     description: '(legacy)',                              color: 'text-slate-600',   bgColor: 'bg-slate-50 dark:bg-slate-900/40',   icon: '⏰' },
  unsubscribe:       { label: 'Unsubscribe',       description: '(legacy)',                              color: 'text-orange-600',  bgColor: 'bg-orange-50 dark:bg-orange-950/40', icon: '🚫' },
  system:            { label: 'System',            description: 'Platform announcements',                color: 'text-slate-600',   bgColor: 'bg-slate-50 dark:bg-slate-900/40',   icon: 'ℹ' },
}
