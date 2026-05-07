# 12 — Notifications & Reminders

## Goal
Keep team members informed of important events (replies, bounces, quota warnings, follow-up due dates) through real-time in-app notifications, a daily email digest, and configurable reminder alerts.

---

## Features

- In-app notification bell with unread badge count
- Real-time notification push via Supabase Realtime
- Notification types: reply received, email bounced, campaign complete, quota warning, follow-up due, lead assigned
- Mark individual notifications as read; mark all as read
- Notification centre panel (drawer or dropdown)
- User notification preferences (which types to receive, per channel)
- Daily email digest (morning summary via Resend + pg_cron)
- Follow-up due reminders (daily check via pg_cron)
- Quota warning alerts at 80% and 100% per sending account

---

## Database Tables

### `notifications`
```sql
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  type          notification_type NOT NULL,
  title         text NOT NULL,
  body          text,
  link          text,              -- deep link to relevant page
  is_read       boolean DEFAULT false,
  lead_id       uuid REFERENCES leads(id),
  email_id      uuid REFERENCES emails(id),
  campaign_id   uuid REFERENCES campaigns(id),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
```

### `notification_preferences`
```sql
CREATE TABLE notification_preferences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  type          notification_type NOT NULL,
  in_app        boolean DEFAULT true,
  email_digest  boolean DEFAULT true,
  UNIQUE(user_id, workspace_id, type)
);
```

---

## Notification Types & Triggers

| Type | Trigger | Who Gets It | Link |
|---|---|---|---|
| `reply_received` | Webhook: email.replied event | Email sender | `/leads/[id]` |
| `bounce` | Webhook: email.bounced event | Email sender + admin | `/leads/[id]` |
| `campaign_complete` | campaign status → completed | Campaign creator + admin | `/campaigns/[id]` |
| `quota_warning` | `emails_sent_today` reaches 80% | Admins | `/settings/sending-accounts` |
| `follow_up_due` | pg_cron daily check (9am UTC) | Assigned rep | `/leads/[id]` |
| `lead_assigned` | Lead `assigned_to` field changed | Newly assigned rep | `/leads/[id]` |

---

## API Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/notifications` | Get user's notifications (paginated) | rep+ |
| PATCH | `/api/notifications/[id]/read` | Mark notification as read | rep+ |
| POST | `/api/notifications/read-all` | Mark all notifications as read | rep+ |
| DELETE | `/api/notifications/[id]` | Dismiss notification | rep+ |
| GET | `/api/notifications/preferences` | Get notification preferences | rep+ |
| PATCH | `/api/notifications/preferences` | Update notification preferences | rep+ |
| GET | `/api/notifications/unread-count` | Lightweight unread count | rep+ |

---

## Real-Time Notifications (Supabase Realtime)

### Server: Create Notification
```ts
// Called from webhook handlers and background jobs
async function createNotification(supabase, {
  workspaceId,
  userId,
  type,
  title,
  body,
  link,
  leadId?,
  emailId?,
  campaignId?
}) {
  // Check user's preferences first
  const pref = await getNotificationPreference(userId, workspaceId, type);
  if (!pref.in_app) return;

  await supabase.from('notifications').insert({
    workspace_id: workspaceId,
    user_id: userId,
    type, title, body, link,
    lead_id: leadId,
    email_id: emailId,
    campaign_id: campaignId
  });
  // Supabase Realtime automatically pushes this to subscribed clients
}
```

### Client: Subscribe to Notifications
```ts
// In NotificationProvider (client component, global layout)
useEffect(() => {
  const channel = supabase
    .channel('notifications')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      addNotificationToState(payload.new);
      incrementUnreadCount();
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [userId]);
```

---

## Daily Email Digest

### pg_cron Schedule
```sql
SELECT cron.schedule(
  'send-daily-digest',
  '0 8 * * *',  -- 8am UTC daily
  $$SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/send-daily-digest',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'
  )$$
);
```

### Edge Function: `send-daily-digest`
```
1. Fetch all active workspace members with email_digest = true for any notification type
2. For each user:
   a. Fetch their unread notifications from last 24h
   b. Fetch their follow-ups due today
   c. Fetch their recent activity summary (emails sent, replies received)
   d. If nothing to report: skip (no empty digest emails)
   e. Build digest email HTML (template with sections)
   f. Send via Resend
   g. Do NOT mark notifications as read (user must open app)
```

### Digest Email Template Sections
```
Subject: "Your Summits CRM Daily Summary - [Date]"

1. 🎯 Follow-ups Due Today (N tasks)
   - Lead Name — [View]

2. 📬 Replies Received (N)
   - Lead Name replied to "[Subject]" — [View]

3. ⚠️ Alerts (if any)
   - Sending account "Gmail Outreach" is at 90% quota

4. 📊 Yesterday's Activity
   - Emails sent: X | Opened: Y | Replied: Z

[View Full Dashboard →]
```

---

## Follow-Up Reminders

### pg_cron Schedule
```sql
SELECT cron.schedule(
  'check-follow-ups',
  '0 9 * * *',  -- 9am UTC daily
  $$SELECT net.http_post(...)$$
);
```

### Edge Function: `check-follow-ups`
```
1. Fetch follow_ups WHERE due_at::date = CURRENT_DATE AND completed_at IS NULL
2. For each due follow-up:
   a. Create notification for assigned_to user (type: follow_up_due)
   b. Check if already notified today (prevent duplicates)
```

---

## Quota Warning Trigger

Called from `process-email-queue` Edge Function during each send:

```ts
const quotaPct = (account.emails_sent_today / account.daily_limit) * 100;

if (quotaPct >= 80 && quotaPct < 100) {
  await createNotificationIfNotExists({
    type: 'quota_warning',
    title: `Sending account "${account.name}" is at ${Math.round(quotaPct)}% daily quota`,
    body: `${account.emails_sent_today}/${account.daily_limit} emails sent today.`,
    link: '/settings/sending-accounts'
  }, { dedupKey: `quota_warn_${account.id}_${today}` });
}
```

**Dedup key** prevents duplicate notifications for the same account on the same day.

---

## UI Components

### `<NotificationBell>`
- Bell icon in top navigation
- Red badge showing unread count
- Subscribes to Realtime on mount
- Click opens `<NotificationPanel>`

### `<NotificationPanel>` (Drawer/Popover)
- Header: "Notifications" + "Mark all read" button
- Scrollable list of `<NotificationItem>` components
- Empty state: "No new notifications"
- "View All" link → full notification page

### `<NotificationItem>`
- Icon by type (reply = ↩️, bounce = ⚠️, follow-up = 📅, quota = 🔴)
- Title + body text
- Relative time
- Unread indicator (blue dot)
- Click: marks as read + navigates to `link`

### `<NotificationsPage>` (`/notifications`)
- Full paginated list of all notifications
- Filter by type, read/unread
- Bulk mark as read

### `<NotificationPreferencesPanel>` (in user settings)
- Table: Notification Type | In-App | Email Digest
- Toggle switches per row

---

## Implementation Order

1. Create `notifications` and `notification_preferences` tables + migrations
2. Set up Supabase Realtime on `notifications` table
3. Build `createNotification` utility function
4. Build `GET /api/notifications` + `<NotificationPanel>` + `<NotificationBell>`
5. Build mark-as-read endpoints
6. Wire `reply_received` notification from Resend webhook handler
7. Wire `bounce` notification from Resend webhook handler
8. Wire `campaign_complete` notification from campaign Edge Function
9. Wire `quota_warning` notification from queue processor
10. Wire `lead_assigned` notification from lead PATCH route
11. Build `check-follow-ups` Edge Function + pg_cron
12. Build `send-daily-digest` Edge Function + pg_cron
13. Build `<NotificationPreferencesPanel>` + API routes

---

## Testing Checklist

- [ ] Notification appears in bell within 2 seconds of trigger (Realtime)
- [ ] Unread count increments on new notification
- [ ] Marking a notification as read removes unread indicator
- [ ] "Mark all read" clears all unread indicators
- [ ] Reply notification created when Resend webhook fires replied event
- [ ] Bounce notification sent to email sender and admins
- [ ] Quota warning fires at 80% (not before, not duplicate on same day)
- [ ] Follow-up due notification created at 9am UTC on due date
- [ ] Daily digest email sent only when there is content
- [ ] Digest skipped if user has no events in last 24h
- [ ] Notification preferences: toggling email_digest off stops digest for that type
- [ ] Deep links navigate to correct page

---

## AI Model Guidance

- **No AI needed** for notification delivery, Realtime push, or digest generation.
- **GPT-4o-mini** could be used to generate a "smart subject line" for the daily digest based on content (e.g., "🎯 3 follow-ups due + a new reply from Acme Corp") — very cheap and adds personalisation.
- This is a low-priority enhancement; implement only after core notification system is working.
