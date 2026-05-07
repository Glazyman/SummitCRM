# 08 — Bulk Email System (Campaigns)

## Goal
Allow managers and admins to create multi-step email campaigns targeting lead batches, with scheduling, per-lead personalisation, daily sending limit enforcement, and campaign-level analytics.

---

## Features

- Campaign builder: name, target batch, sending account, schedule
- Multi-step sequence support (e.g., initial email + 2-day follow-up + 5-day follow-up)
- Template system with merge variables
- Optional AI personalisation per step (uses batch AI from `09-ai-enrichment.md`)
- Daily sending limit respected: overflow queued to next day automatically
- Campaign statuses: `draft`, `scheduled`, `running`, `paused`, `completed`, `cancelled`
- Pause and resume campaigns mid-execution
- Per-campaign analytics: sent, opened, clicked, replied, bounced
- Exclude leads who have already replied or unsubscribed
- Preview mode: see rendered email for a sample lead

---

## Database Tables

Primary: `campaigns`, `campaign_sequence_steps`, `emails`, `email_queue`, `leads`

Refer to `03-database-schema.md` for DDL.

### Campaign Execution Model

When a campaign starts:
1. All leads in the batch are expanded into `emails` rows (one per lead per sequence step, with `scheduled_for` calculated from step delay)
2. The `email_queue` table receives entries for step 1 emails
3. The queue processor sends step 1 emails respecting daily limits
4. Subsequent steps are queued as their `scheduled_for` date arrives
5. Each step skips leads who replied or unsubscribed after step 1

---

## API Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/campaigns` | List campaigns | manager+ |
| POST | `/api/campaigns` | Create campaign | manager+ |
| GET | `/api/campaigns/[id]` | Campaign detail + stats | manager+ |
| PATCH | `/api/campaigns/[id]` | Update campaign (draft only) | manager+ |
| DELETE | `/api/campaigns/[id]` | Delete campaign (draft only) | admin+ |
| POST | `/api/campaigns/[id]/start` | Start/schedule campaign | manager+ |
| POST | `/api/campaigns/[id]/pause` | Pause running campaign | manager+ |
| POST | `/api/campaigns/[id]/resume` | Resume paused campaign | manager+ |
| POST | `/api/campaigns/[id]/cancel` | Cancel campaign | admin+ |
| GET | `/api/campaigns/[id]/analytics` | Detailed campaign analytics | manager+ |
| GET | `/api/campaigns/[id]/emails` | Per-lead email status | manager+ |
| POST | `/api/campaigns/[id]/preview` | Preview email for sample lead | manager+ |

---

## Campaign Creation Payload

```ts
// POST /api/campaigns
{
  name: "Q2 Outreach — SaaS Founders",
  description: "Targeting SaaS founders from imported list",
  batch_id: "uuid",
  sending_account_id: "uuid",
  scheduled_start: "2026-05-10T08:00:00Z",  // null = start immediately
  steps: [
    {
      step_number: 1,
      subject_template: "Quick question about {{company}}",
      body_template: "<p>Hi {{first_name}},\n\n...</p>",
      delay_days: 0,
      use_ai: true,
      ai_tone: "professional"
    },
    {
      step_number: 2,
      subject_template: "Following up",
      body_template: "<p>Hi {{first_name}}, just wanted to circle back...</p>",
      delay_days: 3,
      use_ai: false
    }
  ]
}
```

---

## Campaign Execution Engine (Edge Function)

### `process-campaign` (Edge Function)
Called once when a campaign starts:

```
1. Fetch all leads in campaign's batch (excluding unsubscribed, DNC)
2. For each lead:
   a. For each sequence step:
      - Calculate scheduled_for = campaign_start + step.delay_days
      - If step.use_ai = true: queue AI personalisation job
      - Else: merge variables into template immediately
      - Insert emails row (status='queued', scheduled_for=calculated_date)
      - Insert email_queue row
3. Update campaign: status='running', started_at=now(), total_leads=count
4. Update campaign step 1 emails → ready to send immediately
```

### `process-email-queue` (Edge Function — runs every 2 min via pg_cron)

```
1. Acquire advisory lock (prevent duplicate execution)
2. Fetch sending accounts needing processing (has queued emails)
3. For each sending account:
   a. Calculate remaining_today = daily_limit - emails_sent_today
   b. If remaining_today = 0: skip, move to next account
   c. Fetch up to remaining_today emails from queue:
      WHERE scheduled_for <= now()
        AND sending_account_id = account.id
        AND locked_at IS NULL
      ORDER BY scheduled_for ASC
      LIMIT remaining_today
   d. Lock each row (UPDATE locked_at = now())
   e. For each email:
      - Build HTML (merge vars + tracking + unsubscribe footer)
      - Send via Resend or nodemailer
      - On success: update emails.status='sent', sent_at=now()
      - On failure: update attempts++, clear locked_at
                    if attempts >= 3: status='failed'
      - Increment sending_account.emails_sent_today
   f. Update campaign stats (emails_sent count)
4. Release advisory lock
```

### Daily Overflow Handling
```
When emails_sent_today = daily_limit for an account:
- All remaining queued emails for that account have scheduled_for pushed to next day 8am
- A notification is created: "Campaign X paused on [account] — quota reached"
- Campaign status remains 'running' (will resume tomorrow)
```

---

## Pause / Resume Logic

**Pause**:
```sql
UPDATE campaigns SET status = 'paused' WHERE id = $1;
-- Queue processor checks campaign status before sending:
-- If campaign.status = 'paused', skip all emails for that campaign
```

**Resume**:
```sql
UPDATE campaigns SET status = 'running' WHERE id = $1;
-- Queue processor resumes picking up emails for this campaign
```

---

## Step Skip Logic (Respect Replies)

Before sending each step:
```sql
-- Skip lead if they replied to any prior step in this campaign
SELECT 1 FROM emails
WHERE lead_id = $1
  AND campaign_id = $2
  AND status = 'replied'
LIMIT 1;

-- Skip lead if unsubscribed
SELECT 1 FROM leads
WHERE id = $1 AND is_unsubscribed = true;
```

---

## Template Merge Variables

Same variables as single email system:
```
{{first_name}}, {{last_name}}, {{full_name}},
{{company}}, {{title}}, {{website}},
{{sender_name}}, {{sender_email}}
```

AI-generated emails replace the template body entirely (merge vars in subject remain).

---

## UI Components

### `<CampaignsListPage>`
- Table: Name, Batch, Status, Leads, Sent, Open Rate, Reply Rate, Created
- Status badges: draft (grey), scheduled (blue), running (green), paused (yellow), completed (grey), cancelled (red)
- "New Campaign" button

### `<CampaignBuilderPage>` — Multi-step form
**Step 1: Basics**
- Name, description
- Target batch dropdown (shows lead count)
- Sending account dropdown (shows quota remaining)
- Start time: "Now" or date/time picker

**Step 2: Sequence**
- Add/remove/reorder steps
- Each step: subject, body (rich text), delay days, AI toggle + tone

**Step 3: Preview**
- Select a sample lead from the batch
- Renders step 1 email with merged variables
- Shows AI draft if `use_ai = true`

**Step 4: Confirm & Launch**
- Summary: X leads, Y steps, Z emails total, estimated completion date
- Launch button

### `<CampaignDetailPage>`
- Header: campaign name, status badge, action buttons (Pause/Resume/Cancel)
- Tabs: Overview | Emails | Analytics

**Overview tab**:
- Stats cards: Total Leads, Sent, Open Rate, Click Rate, Reply Rate, Bounce Rate
- Progress bar: emails sent / total
- Sequence step status (step 1: 200 sent, step 2: queued for Mon)

**Emails tab**:
- Per-lead email status table
- Columns: Lead, Step, Subject, Status, Sent At, Opened, Clicked, Replied

**Analytics tab** — see `11-analytics.md`

### `<CampaignSequenceBuilder>`
- Visual step cards with drag-to-reorder
- Each card: step number, delay badge, subject preview, AI badge if enabled
- "+ Add Step" button at bottom

---

## Implementation Order

1. Create `campaigns` + `campaign_sequence_steps` tables + migrations
2. Build `POST /api/campaigns` + campaign creation validation
3. Build `<CampaignBuilderPage>` (steps 1 + 2)
4. Build campaign preview endpoint + `<PreviewPanel>`
5. Build `POST /api/campaigns/[id]/start` + `process-campaign` Edge Function
6. Extend `process-email-queue` to handle campaign emails + daily limit overflow
7. Build pause/resume/cancel endpoints
8. Build `<CampaignsListPage>` + `<CampaignDetailPage>`
9. Build per-lead email status table (Emails tab)
10. Wire up campaign stats denormalization (update on each send/open/click/reply)

---

## Testing Checklist

- [ ] Campaign with 3 leads and 2 steps creates 6 email rows
- [ ] Step 2 emails have correct `scheduled_for` (step 1 date + delay_days)
- [ ] Queue processor sends up to 50 emails per account per day
- [ ] Emails exceeding daily limit are rescheduled to tomorrow
- [ ] Lead who replies to step 1 does not receive step 2
- [ ] Unsubscribed leads are excluded from all steps
- [ ] Paused campaign stops sending immediately
- [ ] Resumed campaign continues from next queued email
- [ ] Cancelled campaign marks all remaining emails as cancelled
- [ ] Campaign stats update correctly on send/open/click/reply
- [ ] Campaign cannot be started if batch has 0 eligible leads
- [ ] Draft campaign can be edited; running campaign cannot
- [ ] Advisory lock prevents double-processing by concurrent queue runs

---

## AI Model Guidance

- **GPT-4o-mini**: Batch personalisation (one API call per lead in background queue) — cost must be controlled at scale.
- **GPT-4o**: Used only for preview of a single AI-drafted email to verify quality.
- Covered in detail in `09-ai-enrichment.md`.
- No AI needed for campaign scheduling, queue processing, or stats aggregation.
