# 07 — Email System

## Goal
Enable team members to send individual personalised emails to leads via connected sending accounts, while enforcing a 50 emails/day limit per account and tracking delivery events.

---

## Features

- Connect and manage multiple sending accounts (Resend API or SMTP)
- 50 emails/day hard limit per sending account
- Daily quota reset via pg_cron at midnight UTC
- Email compose UI with rich text editor
- Merge variable support (`{{first_name}}`, `{{company}}`, etc.)
- Open and click tracking (pixel + redirect)
- Unsubscribe link auto-appended
- Bounce and reply detection via webhook
- Per-lead email history
- Sending account health status (quota used, error rate)
- Prevent sending to unsubscribed/DNC leads

---

## Database Tables

Primary: `sending_accounts`, `emails`, `email_queue`, `unsubscribes`

Refer to `03-database-schema.md` for full DDL.

### Quota Logic
```sql
-- Check if account has quota remaining
SELECT
  id,
  name,
  emails_sent_today,
  daily_limit,
  (daily_limit - emails_sent_today) AS remaining
FROM sending_accounts
WHERE workspace_id = $1
  AND is_active = true
  AND (daily_limit - emails_sent_today) > 0;

-- Increment on send (atomic)
UPDATE sending_accounts
SET emails_sent_today = emails_sent_today + 1
WHERE id = $1 AND emails_sent_today < daily_limit
RETURNING *;
-- If no row returned: quota exceeded
```

### Midnight Reset (pg_cron)
```sql
-- Runs at 00:00 UTC daily
UPDATE sending_accounts
SET emails_sent_today = 0,
    quota_reset_at = CURRENT_DATE;
```

---

## API Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/sending-accounts` | List workspace sending accounts | admin+ |
| POST | `/api/sending-accounts` | Add sending account | admin+ |
| PATCH | `/api/sending-accounts/[id]` | Update account | admin+ |
| DELETE | `/api/sending-accounts/[id]` | Remove account | admin+ |
| POST | `/api/sending-accounts/[id]/test` | Send test email | admin+ |
| GET | `/api/sending-accounts/[id]/quota` | Get quota status | rep+ |
| POST | `/api/emails/send` | Send single email to lead | rep+ |
| GET | `/api/emails/[id]` | Get email details | rep+ |
| GET | `/api/track/open/[pixelId]` | 1x1 pixel open tracking | public |
| GET | `/api/track/click/[emailId]` | Click redirect tracking | public |
| POST | `/api/webhooks/resend` | Resend event webhook | public (verified) |

---

## Sending Account Management

### Resend Account Setup
```ts
// POST /api/sending-accounts
{
  name: "Sales Team (Resend)",
  from_email: "outreach@company.com",
  from_name: "John Smith",
  type: "resend",
  resend_api_key: "re_xxxx"  // encrypted before storage
}
```

### SMTP Account Setup
```ts
{
  name: "Gmail Outreach",
  from_email: "john@company.com",
  from_name: "John Smith",
  type: "smtp",
  smtp_host: "smtp.gmail.com",
  smtp_port: 587,
  smtp_user: "john@company.com",
  smtp_pass: "app-password",  // encrypted before storage
  smtp_secure: false  // STARTTLS
}
```

### Credential Encryption
API keys and SMTP passwords are encrypted using Supabase Vault before being stored:
```ts
// In API route (server-side only)
const { data: vaultSecret } = await supabase.rpc('vault.create_secret', {
  secret: apiKey,
  name: `sending_account_${accountId}_key`
});
// Store vault reference ID, not the raw key
```

---

## Email Send Flow

```
1. User submits compose form → POST /api/emails/send
2. API route validates:
   - Lead exists in workspace and is not unsubscribed/DNC
   - Sending account exists and has quota remaining
3. Insert email row with status 'queued'
4. Insert email_queue row with scheduled_for = now()
5. Return { emailId } to client
6. pg_cron triggers process-email-queue every 2 minutes (or call directly)
7. Edge Function: pick up queued email
8. Increment sending_account.emails_sent_today atomically
9. If quota exceeded: reschedule to tomorrow 8am, update status
10. Build email HTML: merge variables, append tracking pixel, wrap links
11. Send via Resend SDK or nodemailer (SMTP)
12. Update email: status='sent', sent_at=now(), resend_message_id
13. Log activity: email_sent
14. If error: retry up to 3 times, then status='failed'
```

---

## Email HTML Construction

### Merge Variables
Supported in subject and body:
```
{{first_name}}     → lead.first_name
{{last_name}}      → lead.last_name
{{full_name}}      → lead.first_name + last_name
{{company}}        → lead.company
{{title}}          → lead.title
{{sender_name}}    → sending_account.from_name
{{sender_email}}   → sending_account.from_email
```

### Tracking Pixel
```html
<!-- Appended to email HTML body -->
<img src="https://app.summitscrm.com/api/track/open/{{trackingPixelId}}"
     width="1" height="1" style="display:none" alt="" />
```

### Click Tracking
All links in email body are wrapped:
```
https://app.summitscrm.com/api/track/click/{{emailId}}?url=https://original-url.com
```

### Unsubscribe Footer
```html
<p style="font-size:11px;color:#999;">
  Don't want to receive these emails?
  <a href="https://app.summitscrm.com/unsubscribe?token={{unsubToken}}">Unsubscribe</a>
</p>
```

---

## Webhook Handler (`POST /api/webhooks/resend`)

Resend sends events to this endpoint:
```ts
// Verify webhook signature first
const event = await verifyResendWebhook(request);

switch (event.type) {
  case 'email.opened':
    await updateEmail(event.data.message_id, { status: 'opened', opened_at: now });
    await logActivity('email_opened', ...);
    break;
  case 'email.clicked':
    await updateEmail(event.data.message_id, { status: 'clicked', clicked_at: now });
    await logActivity('email_clicked', ...);
    break;
  case 'email.bounced':
    await updateEmail(event.data.message_id, { status: 'bounced', bounced_at: now, bounce_reason: event.data.reason });
    await logActivity('email_bounced', ...);
    await notifyUserOfBounce(...);
    break;
  case 'email.complained':
    await unsubscribeLead(email_address);
    break;
}
```

---

## Open Tracking Handler

```ts
// GET /api/track/open/[pixelId]
// Returns 1x1 transparent GIF, records open event
export async function GET(req, { params }) {
  const { pixelId } = params;
  await updateEmailByPixelId(pixelId, { status: 'opened', opened_at: new Date() });
  // Return 1x1 GIF
  return new Response(TRANSPARENT_GIF_BUFFER, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' }
  });
}
```

---

## Quota Warning System

- At 80% usage (40/50): generate `quota_warning` notification for admin
- At 100% (50/50): generate second notification, emails queue to next day
- Daily digest email includes quota summary for all accounts

---

## UI Components

### `<SendingAccountsPage>`
- Table: Name, From Email, Type, Quota (40/50), Status, Actions
- "Add Account" button → `<AddSendingAccountModal>`
- Quota progress bar per account

### `<AddSendingAccountModal>`
- Toggle: Resend / SMTP
- Resend: name, from email, from name, API key field (masked)
- SMTP: name, from email, from name, host, port, user, password, secure toggle
- "Send Test Email" button

### `<ComposeEmailModal>`
- To field: pre-filled from lead (read-only)
- From: dropdown of available sending accounts with quota shown
- Subject: text input with merge variable chips
- Body: rich text editor (Tiptap or Quill) with merge variable toolbar
- "Preview as Lead" toggle (renders merge variables)
- Send / Schedule toggle
- Character / word count

### `<QuotaStatusBadge>`
- Used in `<ComposeEmailModal>` and sending account list
- Shows remaining sends today, colour-coded (green/yellow/red)

---

## Implementation Order

1. Create `sending_accounts` table + migration
2. Build `GET/POST/PATCH/DELETE /api/sending-accounts` routes
3. Implement Vault encryption for API keys + SMTP passwords
4. Build `<SendingAccountsPage>` + `<AddSendingAccountModal>`
5. Build test email endpoint + send test flow
6. Create `emails` + `email_queue` tables + migration
7. Build `POST /api/emails/send` with quota check
8. Build `<ComposeEmailModal>` with merge variable support
9. Build Supabase Edge Function `process-email-queue`
10. Implement tracking pixel + click redirect endpoints
11. Register Resend webhook + build handler
12. Build unsubscribe page + handler
13. Set up pg_cron quota reset job
14. Build quota warning notifications

---

## Testing Checklist

- [ ] Sending account (Resend) can be added and tested
- [ ] Sending account (SMTP) can be added and tested
- [ ] API keys are never returned raw in any API response
- [ ] Email sends successfully to a real address via Resend
- [ ] Email sends successfully via SMTP
- [ ] Sending to unsubscribed lead returns 400 error
- [ ] Sending to DNC lead returns 400 error
- [ ] Quota increments by 1 on each send
- [ ] Quota check prevents send at 50/day (emails queue to tomorrow)
- [ ] pg_cron resets quota at midnight UTC
- [ ] Open tracking records `email_opened` event
- [ ] Click tracking redirects to correct URL and logs event
- [ ] Resend webhook correctly handles bounce, open, click events
- [ ] Unsubscribe link works and marks lead as unsubscribed
- [ ] 80% quota warning notification is created

---

## AI Model Guidance

- **No AI needed** for the sending/tracking infrastructure.
- AI email drafting is covered in `09-ai-enrichment.md`.
- **GPT-4o-mini** could optionally be used for subject line suggestions as a lightweight helper in the compose form.
