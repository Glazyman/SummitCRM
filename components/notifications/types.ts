// Notification types the product emits. The DB enum was trimmed to
// match this set in migration 20260513000001 — legacy email-era types
// (bounce, campaign_complete, reply_received, quota_warning,
// task_reminder, unsubscribe) were dropped along with any inert rows.

export type NotificationType =
  | 'mention'           // a teammate assigned you a note
  | 'follow_up_due'     // scheduled follow-up reached its due time
  | 'lead_assigned'     // an admin assigned a lead to you

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
  mention:       { label: 'Note assigned', description: 'A teammate assigned a note to you', color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-950/40', icon: '@' },
  follow_up_due: { label: 'Follow-up due', description: 'A scheduled follow-up is due',      color: 'text-amber-600',  bgColor: 'bg-amber-50 dark:bg-amber-950/40',  icon: '📅' },
  lead_assigned: { label: 'Lead assigned', description: 'A lead was assigned to you',        color: 'text-sky-600',    bgColor: 'bg-sky-50 dark:bg-sky-950/40',      icon: '👤' },
}
