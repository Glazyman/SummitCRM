# 06 — Lead Detail & Activity

## Goal
Provide a comprehensive single-lead view with full profile information, an immutable activity timeline, notes, email history, and action buttons for emailing, AI drafting, and follow-up scheduling.

---

## Features

- Full lead profile display and edit
- Activity timeline (all events in chronological order)
- Email history (all emails sent to this lead)
- Notes (create, edit, delete)
- Follow-up scheduling (manual and AI-suggested)
- Quick actions: Send Email, AI Draft, Change Status, Assign To
- Unsubscribe / Do Not Contact toggle
- Custom fields display and edit
- "Open in LinkedIn" link (if URL present)

---

## Database Tables

Primary: `leads`, `notes`, `emails`, `activity_logs`, `follow_ups`

**Activity timeline query**:
```sql
SELECT
  'activity' AS source,
  id,
  type,
  metadata,
  created_at,
  user_id
FROM activity_logs
WHERE lead_id = $1

UNION ALL

SELECT
  'note' AS source,
  id,
  'note_added' AS type,
  jsonb_build_object('content', content) AS metadata,
  created_at,
  author_id AS user_id
FROM notes
WHERE lead_id = $1 AND deleted_at IS NULL

ORDER BY created_at DESC;
```

---

## API Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/leads/[id]` | Get full lead with related data | rep+ |
| PATCH | `/api/leads/[id]` | Update lead fields | rep+ |
| DELETE | `/api/leads/[id]` | Soft delete lead | manager+ |
| POST | `/api/leads/[id]/notes` | Create note | rep+ |
| PATCH | `/api/leads/[id]/notes/[noteId]` | Edit note | rep+ (own notes) |
| DELETE | `/api/leads/[id]/notes/[noteId]` | Delete note | rep+ (own notes) |
| GET | `/api/leads/[id]/emails` | Get email history | rep+ |
| GET | `/api/leads/[id]/activity` | Get activity timeline | rep+ |
| POST | `/api/leads/[id]/follow-ups` | Schedule follow-up | rep+ |
| PATCH | `/api/leads/[id]/follow-ups/[fId]` | Update/complete follow-up | rep+ |
| DELETE | `/api/leads/[id]/follow-ups/[fId]` | Delete follow-up | rep+ |
| POST | `/api/leads/[id]/unsubscribe` | Mark as unsubscribed | admin+ |

---

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Leads          John Smith · Acme Corp        │
│  [Send Email] [AI Draft] [Change Status ▼] [Assign ▼]  │
├─────────────────┬───────────────────────────────────────┤
│                 │                                       │
│  PROFILE        │  ACTIVITY TIMELINE                   │
│  ─────────────  │  ───────────────────────────────────  │
│  Email          │  [Note] Added note "Great call"  2h   │
│  Company        │  [Email] Sent: "Following up"    1d   │
│  Title          │  [Email] Opened email             1d  │
│  Phone          │  [Status] Changed to Contacted   3d   │
│  Website        │  [Import] Lead imported           5d  │
│  LinkedIn ↗     │                                       │
│  Source         │  ADD NOTE                            │
│  Status         │  [___________________________]        │
│  Batch          │  [Save Note]                          │
│  Assigned To    │                                       │
│  Custom Fields  │  FOLLOW-UPS                          │
│                 │  [ ] Call back Thursday              │
│  [Edit Profile] │  [+ Add Follow-up]                   │
│                 │                                       │
└─────────────────┴───────────────────────────────────────┘
```

---

## UI Components

### `<LeadDetailPage>` — Server component
Fetches lead, emails, activity, notes, follow-ups in parallel server-side queries.

### `<LeadProfileCard>`
- Displays all lead fields
- Edit mode: inline form with Save/Cancel
- Status badge with click-to-change dropdown
- Unsubscribe warning banner if `is_unsubscribed = true`
- "Do Not Contact" badge if status is `do_not_contact`
- Custom fields rendered from JSONB (key-value pairs)

### `<LeadActionBar>`
Sticky top action bar:
- **Send Email**: opens `<ComposeEmailModal>` pre-filled with lead's email
- **AI Draft**: opens `<AIDraftModal>` (see `09-ai-enrichment.md`)
- **Change Status**: dropdown with all status options
- **Assign To**: dropdown of workspace members (admin/manager only)
- **More**: kebab menu → Delete Lead, Mark Do Not Contact, View in CRM

### `<ActivityTimeline>`
Chronological list of all events. Each entry renders based on `type`:

| Activity Type | Icon | Display |
|---|---|---|
| `lead_created` | ➕ | "Lead created manually" |
| `lead_imported` | 📥 | "Imported from CSV [filename]" |
| `lead_status_changed` | 🔄 | "Status changed from X to Y by [User]" |
| `note_added` | 📝 | Note content with edit/delete if own note |
| `email_sent` | ✉️ | "Email sent: [Subject]" → link to email detail |
| `email_opened` | 👁️ | "Opened email: [Subject]" |
| `email_clicked` | 🖱️ | "Clicked link in email: [Subject]" |
| `email_replied` | ↩️ | "Replied to email: [Subject]" |
| `email_bounced` | ⚠️ | "Email bounced: [reason]" |
| `ai_draft_generated` | 🤖 | "AI draft generated by [User]" |
| `follow_up_scheduled` | 📅 | "Follow-up scheduled for [date]" |
| `unsubscribed` | 🚫 | "Lead unsubscribed" |

### `<NoteEditor>`
- Textarea with character limit (5000)
- Save creates `notes` row + logs `note_added` activity
- Edit/delete shows on hover of own notes
- Other users' notes are read-only

### `<EmailHistoryList>`
- Compact list of all emails sent to lead
- Columns: Subject, Sent By, Date, Status (badge: sent/opened/clicked/bounced)
- Click row expands to show email body preview

### `<FollowUpList>`
- Shows pending follow-ups with due date
- Checkbox to mark complete
- "+ Add Follow-up" opens `<FollowUpModal>`

### `<FollowUpModal>`
- Title input
- Notes textarea
- Due date/time picker
- Assign to dropdown
- "Suggest with AI" button (calls AI for timing suggestion)

---

## Activity Logging Pattern

Every significant action logs an entry to `activity_logs`. This is done in API routes:

```ts
// Utility function called in all API routes after mutations
async function logActivity(supabase, {
  workspaceId,
  leadId,
  userId,
  type,
  metadata
}) {
  await supabase.from('activity_logs').insert({
    workspace_id: workspaceId,
    lead_id: leadId,
    user_id: userId,
    type,
    metadata
  });
}
```

**This must be called for**:
- Every status change
- Every note create/edit/delete
- Every email sent
- Every AI draft generated
- Every follow-up scheduled/completed
- Every import

---

## Implementation Order

1. Build `GET /api/leads/[id]` with full data fetch
2. Build `<LeadDetailPage>` layout with profile panel
3. Build `<LeadProfileCard>` with view and edit modes
4. Build `PATCH /api/leads/[id]` for field updates
5. Build `<ActivityTimeline>` with all event type renderers
6. Build note CRUD: `<NoteEditor>`, API routes
7. Build `<EmailHistoryList>` component
8. Build `<FollowUpList>` + `<FollowUpModal>` + API routes
9. Build `<LeadActionBar>` (Send Email + Change Status)
10. Wire up activity logging utility across all routes

---

## Testing Checklist

- [ ] Lead detail loads correct data for given ID
- [ ] RLS: rep cannot view lead from another workspace
- [ ] Profile edit saves correctly and logs `lead_status_changed`
- [ ] Note creation appears in timeline immediately
- [ ] Note edit restricted to note author (and admin+)
- [ ] Note delete soft-deletes and removes from timeline
- [ ] Email history shows correct emails in reverse-chronological order
- [ ] Follow-up can be created, completed, and deleted
- [ ] Status change via action bar logs activity and updates profile
- [ ] Unsubscribe sets `is_unsubscribed = true` and shows warning banner
- [ ] Activity timeline shows correct icons and metadata per type

---

## AI Model Guidance

- **GPT-4o-mini**: Follow-up timing suggestions (given lead's last activity, suggest when to follow up)
- **GPT-4o**: Full email draft generation (covered in `09-ai-enrichment.md`)
- No AI needed for timeline rendering, notes, or profile editing.
