# 11 — Analytics

## Goal
Provide email performance metrics, lead funnel tracking, and campaign analytics to help teams measure outreach effectiveness and optimise their approach.

---

## Features

- Email performance metrics: sent, open rate, click rate, reply rate, bounce rate
- Lead funnel view: new → contacted → replied → interested → converted
- Campaign-level analytics with per-step breakdown
- Time-series charts (emails sent per day, open rate trend)
- Rep performance comparison
- Batch performance comparison
- Date range filter
- CSV export of all analytics data
- Conversion rate tracking (lead status → converted)

---

## Data Sources

All analytics are derived from existing tables — no separate analytics DB needed at MVP scale.

| Metric | Source Table | Derivation |
|---|---|---|
| Emails sent | `emails` | COUNT WHERE status != 'queued' |
| Open rate | `emails` | opened / sent |
| Click rate | `emails` | clicked / sent |
| Reply rate | `emails` | replied / sent |
| Bounce rate | `emails` | bounced / sent |
| Lead funnel | `leads` | GROUP BY status |
| Conversion rate | `leads` | converted / total |
| Campaign stats | `campaigns` | Denormalized columns (updated on events) |
| Rep performance | `emails` JOIN `workspace_members` | GROUP BY sent_by |

---

## API Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/analytics/email-metrics` | Aggregate email stats | rep+ |
| GET | `/api/analytics/funnel` | Lead funnel counts | rep+ |
| GET | `/api/analytics/time-series` | Daily email stats over time | manager+ |
| GET | `/api/analytics/campaigns` | Campaign comparison table | manager+ |
| GET | `/api/analytics/reps` | Rep performance comparison | admin+ |
| GET | `/api/analytics/batches` | Batch comparison table | manager+ |
| GET | `/api/analytics/export` | CSV export of current view | manager+ |

### Common Query Parameters
```
?start=2026-04-01
&end=2026-04-30
&campaign_id=uuid        (optional: filter to campaign)
&rep_id=uuid             (optional: filter to rep; reps can only filter to self)
&batch_id=uuid           (optional)
```

### `/api/analytics/email-metrics` Response
```ts
{
  period: { start: string, end: string },
  totals: {
    sent: number,
    opened: number,
    clicked: number,
    replied: number,
    bounced: number,
    open_rate: number,      // percentage
    click_rate: number,
    reply_rate: number,
    bounce_rate: number
  }
}
```

### `/api/analytics/funnel` Response
```ts
{
  funnel: [
    { status: 'new', count: 450, percentage: 100 },
    { status: 'contacted', count: 280, percentage: 62 },
    { status: 'replied', count: 84, percentage: 18.7 },
    { status: 'interested', count: 31, percentage: 6.9 },
    { status: 'converted', count: 12, percentage: 2.7 }
  ]
}
```

### `/api/analytics/time-series` Response
```ts
{
  series: [
    { date: '2026-04-01', sent: 48, opened: 12, replied: 3 },
    { date: '2026-04-02', sent: 50, opened: 15, replied: 5 },
    ...
  ]
}
```

---

## Database Queries

### Time-Series Query
```sql
SELECT
  DATE(sent_at) AS date,
  COUNT(*) FILTER (WHERE status IN ('sent', 'opened', 'clicked', 'replied', 'bounced')) AS sent,
  COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')) AS opened,
  COUNT(*) FILTER (WHERE status = 'clicked') AS clicked,
  COUNT(*) FILTER (WHERE status = 'replied') AS replied,
  COUNT(*) FILTER (WHERE status = 'bounced') AS bounced
FROM emails
WHERE workspace_id = $1
  AND sent_at BETWEEN $2 AND $3
GROUP BY DATE(sent_at)
ORDER BY date ASC;
```

### Lead Funnel Query
```sql
SELECT
  status,
  COUNT(*) AS count
FROM leads
WHERE workspace_id = $1
  AND deleted_at IS NULL
GROUP BY status;
```

### Campaign Comparison
```sql
SELECT
  id, name, status,
  total_leads,
  emails_sent,
  ROUND(100.0 * emails_opened / NULLIF(emails_sent, 0), 1) AS open_rate,
  ROUND(100.0 * emails_clicked / NULLIF(emails_sent, 0), 1) AS click_rate,
  ROUND(100.0 * emails_replied / NULLIF(emails_sent, 0), 1) AS reply_rate,
  ROUND(100.0 * emails_bounced / NULLIF(emails_sent, 0), 1) AS bounce_rate,
  started_at, completed_at
FROM campaigns
WHERE workspace_id = $1
  AND ($2::timestamptz IS NULL OR started_at >= $2)
ORDER BY started_at DESC;
```

---

## UI Components

### `<AnalyticsPage>`
Top-level page. Tabs: Overview | Campaigns | Funnel | Reps | Batches

### `<AnalyticsDateRange>`
Shared date range picker (presets + custom). Synced to URL params.

### `<EmailMetricsCards>`
Four stat cards side by side:
- Total Sent
- Open Rate (with trend arrow vs previous period)
- Reply Rate (with trend arrow)
- Bounce Rate (red if > 5%)

### `<EmailTimeSeriesChart>`
Line chart (using Recharts):
- X-axis: dates
- Y-axis: count
- Lines: Sent, Opened, Replied
- Toggle lines on/off

### `<LeadFunnelChart>`
Horizontal funnel bars or stacked bar chart:
- Each status as a stage
- Shows count + percentage drop from previous stage
- Highlights where the biggest drop-off occurs

### `<CampaignComparisonTable>`
Sortable table:
- Columns: Campaign, Status, Leads, Sent, Open Rate, Click Rate, Reply Rate, Bounce Rate, Date
- Click campaign name → `<CampaignDetailPage>`
- Sort by open rate to find best-performing campaigns

### `<RepPerformanceTable>`
Admin-only. Sortable table:
- Columns: Rep, Emails Sent, Open Rate, Reply Rate, Leads Assigned, Last Active
- Useful for identifying top performers and those who need support

### `<BatchComparisonTable>`
- Columns: Batch Name, Lead Count, Emails Sent, Open Rate, Reply Rate
- Identify which lead sources perform best

### `<AnalyticsExportButton>`
- Downloads CSV of current view and date range
- Triggers `GET /api/analytics/export` with current params

---

## Rep-Scoped Analytics

When a `rep` accesses the analytics page:
- All queries are automatically filtered to `sent_by = current_user_id`
- Funnel is filtered to `assigned_to = current_user_id`
- Rep comparison table is hidden
- Page title shows "My Analytics" instead of "Team Analytics"

This is enforced at the API route level:
```ts
const isSelf = role === 'rep';
const repFilter = isSelf ? currentUserId : (query.rep_id || null);
```

---

## Caching Strategy

Analytics queries can be slow on large datasets. Use Supabase's `unstable_cache` (Next.js) or short-lived server-side caching:

```ts
// Cache analytics results for 5 minutes
const metrics = await unstable_cache(
  async () => fetchEmailMetrics(workspaceId, start, end),
  ['email-metrics', workspaceId, start, end],
  { revalidate: 300 }
)();
```

For real-time dashboards (admin overview), skip cache. For historical date ranges, cache aggressively.

---

## Performance Considerations

- All analytics queries use `workspace_id` as the primary filter (indexed)
- Add covering indexes for time-series queries: `(workspace_id, sent_at, status)`
- Campaign stats are denormalized on `campaigns` table — no full JOIN required for list view
- Avoid full table scans: always scope to date range

```sql
CREATE INDEX idx_emails_analytics
  ON emails(workspace_id, sent_at, status)
  WHERE sent_at IS NOT NULL;
```

---

## Implementation Order

1. Add analytics index on `emails` table
2. Build `GET /api/analytics/email-metrics`
3. Build `<EmailMetricsCards>` component
4. Build `GET /api/analytics/time-series` + `<EmailTimeSeriesChart>`
5. Build `GET /api/analytics/funnel` + `<LeadFunnelChart>`
6. Build `GET /api/analytics/campaigns` + `<CampaignComparisonTable>`
7. Build `GET /api/analytics/reps` + `<RepPerformanceTable>`
8. Build `GET /api/analytics/batches` + `<BatchComparisonTable>`
9. Add date range picker + URL param sync
10. Build CSV export endpoint

---

## Testing Checklist

- [ ] Metrics match manual count of emails in DB for test period
- [ ] Open rate = opened / sent (not total)
- [ ] Rep-scoped view only shows rep's own data
- [ ] Date range filter correctly scopes all queries
- [ ] Funnel shows correct drop-off percentages
- [ ] Campaign comparison shows correct per-campaign rates
- [ ] Time-series chart renders correctly for 30-day period
- [ ] CSV export matches on-screen data
- [ ] Analytics routes return 403 for viewer role on rep-only+ routes
- [ ] Analytics cache does not serve stale data after send events

---

## AI Model Guidance

- **No AI needed** for data aggregation or chart rendering.
- **GPT-4o-mini** can optionally be used for a "Coaching Tip" widget: given a rep's stats, generate one actionable suggestion (e.g., "Your open rate is 12% — consider testing a more specific subject line").
- Only add AI coaching if prioritised — keep analytics page fast and data-focused.
