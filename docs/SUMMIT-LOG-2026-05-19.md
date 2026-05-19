# Session handoff — 2026-05-19

Summary of every change shipped during this session, where the code lives, what was decided, and what's intentionally left for later. Read top to bottom on first load; jump-to from the table of contents after.

- Project: **SummitCRM** at `/Users/glazy/Desktop/SummitCRM/`
- Branch: `main`
- 3 commits, all pushed to `origin/main` (`Glazyman/SummitCRM`)
- 1 production DB migration applied via Supabase MCP (project `nmcyxulluascofmsgkxr`)

---

## Table of contents

1. [Call logs double-counting bug](#1-call-logs-double-counting-bug)
2. [call_logs 1000-row cap — team-stats and rep-performance](#2-call_logs-1000-row-cap--team-stats-and-rep-performance)
3. [Dashboard KPI window widened to 30 days](#3-dashboard-kpi-window-widened-to-30-days)
4. [Rep Performance Panel — auto-step back on empty period](#4-rep-performance-panel--auto-step-back-on-empty-period)
5. [Quirks worth remembering](#5-quirks-worth-remembering)

---

## 1. Call logs double-counting bug

**Symptom:** Admin dashboard "Calls Logged" and the Team Performance Table "Calls" column showed inflated numbers. Numbers on the admin dashboard didn't match numbers on the analytics page.

**Root cause:** Commit `d712296` ("Sync admin call metrics with call-like status changes") simultaneously:
1. Updated the bulk status-change route to write `call_logs` rows for call-like statuses (called, voicemail, no_answer, etc.)
2. Added synthetic counting to `overview`, `team-stats`, and `rep-performance` routes that also counted those same bulk changes from `activity_logs` (where `type = 'lead_status_changed'` and `metadata.bulk = true`)

Since both happened in the same commit, bulk calls were always present in BOTH sources — making every bulk call count twice.

All call paths now write to `call_logs` directly:
- Log Call UI → `call_logs` row via `POST /api/leads/[id]/calls`
- Individual status change to call-like status → `call_logs` row (auto-logged, commit `8b4b580`)
- Bulk status change to call-like status → `call_logs` row (commit `d712296`)

**Fix:** Removed the `activity_logs` synthetic count from all four places:

| File | Change |
|---|---|
| `app/api/admin/overview/route.ts` | Removed `statusActivitiesRes` query + `synthetic` math; `callsCount = callsRes.count ?? 0` |
| `app/api/admin/team-stats/route.ts` | Removed `callLogsRes` raw fetch + `syntheticRows`; now uses `get_call_stats_by_rep` RPC |
| `app/api/admin/rep-performance/route.ts` | Removed `callsRes` raw fetch + `syntheticCallsByUser`; now uses `get_call_stats_by_rep` RPC |
| `app/(dashboard)/dashboard/page.tsx` | Removed `statusActivitiesRes` query + `synthetic` math; `callsLogged = callsRes.count ?? 0` |

**Commit:** `8451226`

---

## 2. call_logs 1000-row cap — team-stats and rep-performance

**Problem:** `team-stats` and `rep-performance` fetched raw `call_logs` rows to count calls per rep. PostgREST has a hard 1000-row cap on all row-returning queries — `.range()` and `.limit()` cannot bypass it. For a workspace with many calls in a date window, only the first 1000 rows would come back, silently under-counting every rep's call total.

**Fix:** New SQL aggregate function `get_call_stats_by_rep`:

```sql
-- supabase/migrations/20260519000001_call_stats_by_rep_rpc.sql
CREATE FUNCTION public.get_call_stats_by_rep(
  p_workspace_id uuid, p_start timestamptz, p_end timestamptz
) RETURNS jsonb ...
```

Returns `[{logged_by, outcome, cnt}]` grouped by (rep, outcome) as a single jsonb row. Single-row responses are exempt from PostgREST's row cap (same pattern used by `get_batch_analytics`, `get_reps_analytics`, etc.).

Both `team-stats` and `rep-performance` now call this RPC and build their per-rep call maps from its result:
- `team-stats`: sums `cnt` per `logged_by` → `calls_count`
- `rep-performance`: maps `{outcome: cnt}` per `logged_by` → `callsByOutcome` + total `calls`

**Migration applied to production:** yes, via Supabase MCP.

**Commit:** `8451226`

---

## 3. Dashboard KPI window widened to 30 days

**Problem:** The "Calls Logged" stat card on the main dashboard (`/dashboard`) used a rolling 7-day window. With all recent calls concentrated in May 11–14 and today being May 19, the 7-day window (May 12–19) excluded 10 calls from May 11 — showing 51 instead of 61.

**Fix:** `app/(dashboard)/dashboard/page.tsx` — changed `weekAgo.setDate(weekAgo.getDate() - 7)` to `-30`. Label updated from `"this week"` to `"last 30 days"`.

This aligns the dashboard KPI with the analytics page, which defaults to a 30-day window.

**Commit:** `0cbfeaf`

---

## 4. Rep Performance Panel — auto-step back on empty period

**Problem:** The Rep Performance Panel on the admin's dashboard defaults to "Day" view (today). When the team hasn't logged any calls today or this week, switching to "Week" showed 0 calls — even though calls exist in the previous week. Nothing indicated to the user that they needed to click the back arrow.

**Fix:** `components/dashboard/rep-performance.tsx` — after loading data for any period, if:
- All reps have 0 calls total, AND
- The viewed period is at or past today (i.e., the user is looking at the "current" period, not a historical one)

...then automatically step back one period and reload. Added an `autoStep` flag (defaults `true`) to prevent infinite loops — the auto-stepped load always passes `autoStep = false`.

```ts
// Only auto-step on current period (never on historical navigation)
if (totalCalls === 0 && isAtOrPastToday(p, a) && autoStep) {
  const prev = stepAnchor(p, a, -1)
  setAnchor(prev)
  return
}
```

This means switching to "Week" now lands the user on the most recent week with actual call data, not the current (possibly empty) week.

**Commit:** `0cbfeaf`

---

## 5. Quirks worth remembering

### All call paths write to call_logs — synthetic counting is obsolete

As of `d712296` (May 10), every action that represents a call attempt creates a `call_logs` row:
- Log Call UI (direct)
- Status PATCH to called/voicemail/no_answer/wrong_number/sold_already (auto-logged)
- Bulk PATCH to same statuses (auto-logged, `auto_logged: true, bulk: true` in `call_logged` activity)

`call_logs` is the single source of truth for call counts. Do not re-add `activity_logs` synthetic counting — it will double-count.

### 32 orphaned call_logged activity entries

A query run during this session revealed 32 `activity_logs` rows with `type = 'call_logged'` where the `metadata.call_log_id` UUID no longer exists in `call_logs`. These were created when calls were deleted (cascade-delete via the activity-delete route). They are harmless — nothing counts from `activity_logs` for call totals anymore — but they're historical noise if you query `activity_logs` for audit purposes.

### PostgREST db-max-rows still applies to analytics routes

`time-series`, `email-metrics`, `funnel` routes were fixed in a prior session (commit `657e12a`) to use RPCs. The `reps` route (`/api/analytics/reps`) was also already using `get_reps_analytics` RPC. The only new RPC added this session was `get_call_stats_by_rep` for the admin dashboard routes.

The `emails` table raw-row fetch in `team-stats` (`adminClient.from('emails').select(...)`) still has the row cap risk. Not fixed this session — would need a `get_email_stats_by_rep` aggregate RPC. Low priority until email volume exceeds 1000 per 30-day window.
