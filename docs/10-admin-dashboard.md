# 10 — Admin Dashboard

## Goal
Give admins and managers a centralised view of workspace health: team performance, sending account quota, campaign status, and AI usage — with the ability to act on issues without leaving the dashboard.

---

## Features

- Team performance overview (emails sent, open rate, reply rate per rep)
- Sending account health (quota used, bounce rate, errors)
- Active campaign status summary
- AI usage and cost overview
- Recent activity feed (workspace-level)
- Quick actions: invite member, adjust quota, pause campaign
- Date range selector (today, 7d, 30d, custom)
- Role gated: visible to admin and manager only (with manager having read-only analytics)

---

## Database Tables

No new tables required. Aggregates from:
- `workspace_members` + `emails` — per-rep stats
- `sending_accounts` — quota data
- `campaigns` — active campaigns
- `ai_usage_logs` — AI cost
- `activity_logs` — recent workspace activity

**Key aggregate queries**:

### Per-Rep Email Stats
```sql
SELECT
  wm.user_id,
  u.email AS user_email,
  u.raw_user_meta_data->>'full_name' AS full_name,
  COUNT(e.id) FILTER (WHERE e.status != 'queued') AS emails_sent,
  COUNT(e.id) FILTER (WHERE e.status = 'opened') AS emails_opened,
  COUNT(e.id) FILTER (WHERE e.status = 'replied') AS emails_replied,
  ROUND(
    100.0 * COUNT(e.id) FILTER (WHERE e.status = 'opened')
    / NULLIF(COUNT(e.id) FILTER (WHERE e.status != 'queued'), 0), 1
  ) AS open_rate,
  ROUND(
    100.0 * COUNT(e.id) FILTER (WHERE e.status = 'replied')
    / NULLIF(COUNT(e.id) FILTER (WHERE e.status != 'queued'), 0), 1
  ) AS reply_rate
FROM workspace_members wm
JOIN auth.users u ON wm.user_id = u.id
LEFT JOIN emails e ON e.sent_by = wm.user_id
  AND e.workspace_id = wm.workspace_id
  AND e.created_at BETWEEN $start AND $end
WHERE wm.workspace_id = $1
  AND wm.is_active = true
GROUP BY wm.user_id, u.email, u.raw_user_meta_data->>'full_name'
ORDER BY emails_sent DESC;
```

### Sending Account Health
```sql
SELECT
  sa.id,
  sa.name,
  sa.from_email,
  sa.type,
  sa.emails_sent_today,
  sa.daily_limit,
  ROUND(100.0 * sa.emails_sent_today / sa.daily_limit, 0) AS quota_pct,
  COUNT(e.id) FILTER (WHERE e.status = 'bounced' AND e.created_at > now() - interval '7d') AS bounces_7d,
  COUNT(e.id) FILTER (WHERE e.status = 'failed' AND e.created_at > now() - interval '7d') AS failures_7d
FROM sending_accounts sa
LEFT JOIN emails e ON e.sending_account_id = sa.id
WHERE sa.workspace_id = $1
  AND sa.is_active = true
GROUP BY sa.id;
```

---

## API Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/admin/overview` | Dashboard summary data | admin+ |
| GET | `/api/admin/team-stats` | Per-rep performance table | admin+ |
| GET | `/api/admin/account-health` | Sending account health | admin+ |
| GET | `/api/admin/campaigns-summary` | Active campaigns list | manager+ |
| GET | `/api/admin/ai-usage` | AI cost summary | admin+ |
| GET | `/api/admin/activity` | Recent workspace activity | admin+ |

### `GET /api/admin/overview` Response
```ts
{
  date_range: { start: string, end: string },
  totals: {
    emails_sent: number,
    open_rate: number,
    reply_rate: number,
    bounce_rate: number,
    active_leads: number,
    new_leads_period: number
  },
  quota_warnings: SendingAccount[],   // accounts at >80% today
  active_campaigns: number,
  ai_tokens_this_month: number,
  ai_cost_usd: number
}
```

---

## UI Components

### `<AdminDashboardPage>`
Server component. Fetches overview data server-side.

### `<DateRangePicker>`
- Presets: Today, Last 7 Days, Last 30 Days, This Month, Custom
- Updates all dashboard components via URL param

### `<OverviewStatsRow>`
Cards showing workspace-wide totals for the selected period:
- Total Emails Sent
- Open Rate
- Reply Rate
- Bounce Rate
- New Leads
- Active Campaigns

### `<TeamPerformanceTable>`
Columns: Rep Name, Role, Emails Sent, Open Rate, Reply Rate, Replies Received, Last Active
- Sortable by any column
- Click rep row → filter lead list to that rep's leads

### `<SendingAccountHealthTable>`
Columns: Account, Type, Quota Used (progress bar), Quota %, Bounces (7d), Failures (7d), Status
- Red highlight if quota > 80%
- Red highlight if bounce rate > 5%
- "Pause" button for accounts with high bounce/failure rates

### `<ActiveCampaignsSummary>`
- Cards for each running/scheduled campaign
- Shows: name, leads, progress bar (sent/total), open rate
- "View" and "Pause" quick action buttons

### `<AIUsageWidget>`
- Tokens used this month vs. budget (progress bar)
- Cost in USD
- "View Details" → `<AIUsageDashboard>`

### `<WorkspaceActivityFeed>`
- Recent workspace-level activity (last 50 events)
- Filterable by event type
- Shows user avatar, action, timestamp

### `<QuickActionsBar>`
- "Invite Team Member" → opens `<InviteModal>`
- "Add Sending Account" → links to settings
- "View All Campaigns" → links to campaigns list

---

## Manager vs Admin View

| Component | admin | manager |
|---|---|---|
| `<OverviewStatsRow>` | Full | Full |
| `<TeamPerformanceTable>` | All reps | All reps (read-only) |
| `<SendingAccountHealthTable>` | Full + pause action | Read-only |
| `<ActiveCampaignsSummary>` | Full + pause | Full + pause |
| `<AIUsageWidget>` | Full | Hidden |
| `<WorkspaceActivityFeed>` | Full | Limited (no admin events) |
| `<QuickActionsBar>` | Full | No invite, no account add |

---

## Implementation Order

1. Build `GET /api/admin/overview` with aggregate query
2. Build `<OverviewStatsRow>` with stat cards
3. Build `GET /api/admin/team-stats` + `<TeamPerformanceTable>`
4. Build `GET /api/admin/account-health` + `<SendingAccountHealthTable>`
5. Build `GET /api/admin/campaigns-summary` + `<ActiveCampaignsSummary>`
6. Build `GET /api/admin/ai-usage` + `<AIUsageWidget>`
7. Build `GET /api/admin/activity` + `<WorkspaceActivityFeed>`
8. Add `<DateRangePicker>` with URL param sync
9. Add `<QuickActionsBar>`
10. Apply role gating (manager vs admin view differences)

---

## Testing Checklist

- [ ] Dashboard loads correct totals for selected date range
- [ ] Changing date range updates all components
- [ ] RLS: admin can only see their own workspace data
- [ ] Team stats show correct per-rep numbers
- [ ] Quota progress bars reflect real-time sending account data
- [ ] Quota warning highlight appears for accounts > 80%
- [ ] Bounce rate alert highlights accounts > 5%
- [ ] Manager cannot see AI usage widget
- [ ] Manager cannot pause a sending account
- [ ] Viewer and rep roles receive 403 on all `/api/admin/*` routes
- [ ] Activity feed shows correct event types and actors

---

## AI Model Guidance

- **No AI needed** for dashboard rendering or data aggregation.
- **GPT-4o-mini** can optionally power a "Weekly Summary" narrative: "This week, your team sent 342 emails with a 24% open rate. Top performer: Sarah with a 31% open rate."
- Only implement AI summary if explicitly requested — keep dashboard focused on data.
