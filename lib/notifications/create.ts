import { createAdminClient } from '@/lib/supabase/server'

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

export interface CreateNotificationInput {
  workspaceId: string
  userId: string
  type: NotificationType
  title: string
  body?: string
  link?: string
  leadId?: string
  emailId?: string
  campaignId?: string
  /** Optional dedup key: if provided, skips insert if a notification with this
   *  title + type + user already exists today. Prevents duplicate quota warnings. */
  dedupKey?: string
}

/**
 * Insert a notification for a user (server-side, uses admin client).
 * Checks the user's in_app preference before inserting.
 * Non-blocking on errors — bad preference data should not break the caller.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    const supabase = createAdminClient() as ReturnType<typeof createAdminClient>
    const sb = supabase as any // eslint-disable-line @typescript-eslint/no-explicit-any

    // Check in-app preference
    const { data: pref } = await sb
      .from('notification_preferences')
      .select('in_app')
      .eq('user_id', input.userId)
      .eq('workspace_id', input.workspaceId)
      .eq('type', input.type)
      .maybeSingle()

    // Default to true if no preference row exists yet
    if (pref && pref.in_app === false) return

    // Dedup check: skip if same user+type+title already exists today
    if (input.dedupKey) {
      const today = new Date().toISOString().slice(0, 10)
      const { data: existing } = await sb
        .from('notifications')
        .select('id')
        .eq('user_id', input.userId)
        .eq('type', input.type)
        .eq('title', input.title)
        .gte('created_at', `${today}T00:00:00Z`)
        .limit(1)
        .maybeSingle()

      if (existing) return
    }

    await sb.from('notifications').insert({
      workspace_id: input.workspaceId,
      user_id:      input.userId,
      type:         input.type,
      title:        input.title,
      body:         input.body ?? null,
      link:         input.link ?? null,
      lead_id:      input.leadId ?? null,
      email_id:     input.emailId ?? null,
      campaign_id:  input.campaignId ?? null,
    })
  } catch {
    // Notifications are non-critical — never throw
  }
}

/**
 * Broadcast a notification to all admins in a workspace.
 */
export async function notifyAdmins(
  workspaceId: string,
  input: Omit<CreateNotificationInput, 'workspaceId' | 'userId'>
): Promise<void> {
  try {
    const sb = createAdminClient() as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: admins } = await sb
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('role', ['admin', 'super_admin'])

    if (!admins?.length) return

    await Promise.all(
      admins.map((a: { user_id: string }) =>
        createNotification({ workspaceId, userId: a.user_id, ...input })
      )
    )
  } catch {
    // Non-critical
  }
}
