# Session handoff — 2026-05-12 → 2026-05-13

Picks up from `docs/HANDOFF-2026-05-12.md`. Covers ~35 commits across four themes: the 6 open items from §14 of the prior handoff (all shipped), a UX/side-panel pass, a perf+notifications cleanup, and a final email/snapshot polish round. 14 production DB migrations applied via Supabase MCP (project `nmcyxulluascofmsgkxr`).

- Project: **SummitCRM** at `/Users/glazy/.dev-houston/workspaces/Glazy/Summit/SummitCRM/`
- Branch: `main`, all commits pushed to `origin/main` (`Glazyman/SummitCRM`)
- Migrations 20260512000002 → 20260512000014 (13 migration files, plus a fix-up redeploy on `_leads_page_rpcs`)
- DB state: 3,009 leads at session start, ~3,009 at end (handful of test rows added)

## Table of contents

1. [Bad Lead bug — null email trigger crash](#1-bad-lead-bug--null-email-trigger-crash)
2. [Side panel polish (state editor, call cascade, copy, status sync)](#2-side-panel-polish)
3. [Activities list color-coded by past / today / future](#3-activities-list-color-coded-by-past--today--future)
4. [Open item #6 — strip `ai_usage_logs.cached`](#4-open-item-6--strip-ai_usage_logscached)
5. [Open item #5 — users-lookup RPC, delete `users-cache.ts`](#5-open-item-5--users-lookup-rpc)
6. [Open item #3 — denormalize `last_contacted_at` + `last_call_outcome`](#6-open-item-3--denormalize-last_contacted_at--last_call_outcome)
7. [Open item #4 — analytics aggregate RPCs (4 routes)](#7-open-item-4--analytics-aggregate-rpcs)
8. [Open item #2 — pipeline trim + server search + `last_activity_at` denorm](#8-open-item-2--pipeline-trim--server-search)
9. [Open item #1 — server-side pagination for `/leads`](#9-open-item-1--server-side-pagination-for-leads)
10. [`/leads` follow-ups (Select All Matching polish, All page-size restored, sort)](#10-leads-follow-ups)
11. [Dashboard: unique-leads-vs-target metric](#11-dashboard-unique-leads-vs-target)
12. [Rep Performance: Today / Target column + Day/Week/Month navigation](#12-rep-performance-todaytarget--daywemonth-nav)
13. [Notes: assign to a teammate (mention notifications)](#13-notes-assign-to-a-teammate)
14. [Side card: click email / phone to copy](#14-click-to-copy-emailphone)
15. [Perf: useTransition + skeletons + parallelization + streaming Suspense](#15-perf-work)
16. [Notifications system overhaul (portal z-index, realtime, unified bell, settings page)](#16-notifications-overhaul)
17. [Quirks worth remembering](#17-quirks-worth-remembering)
18. [Open items / future work](#18-open-items--future-work)
19. [Email snapshot polish (Outlook switch, fallback rewrite, copy button, AI fallback badge)](#19-email-snapshot-polish)
20. [Notes: multi-assign + intake-form Save anchored at bottom](#20-notes-multi-assign--intake-save)

---

## 1. Bad Lead bug — null email trigger crash

User report: clicking "Bad Lead" on certain leads (Kris Kollevoll, Roderick Leonard) flashed and reverted to "New". §13 of the prior handoff had a similar-looking double-PATCH bug that was fixed in `ff5606a`, but this was a different root cause.

**Root cause:** the `sync_lead_unsubscribe` BEFORE-UPDATE trigger inserts into `unsubscribes(workspace_id, email, lead_id, source)` when status flips to `do_not_contact` or `unsubscribed`. `unsubscribes.email` is `NOT NULL`. For leads with `email = NULL` (1,130 of 3,008 — 38% of the workspace), the insert violated the constraint, the UPDATE aborted, the API returned 400, and the frontend's optimistic update rolled back.

**Fix** (migration `20260512000001_fix_unsubscribe_trigger_null_email.sql`): wrap the `INSERT INTO unsubscribes` in `IF NEW.email IS NOT NULL THEN ... END IF`. Still flips `is_unsubscribed` and `unsubscribed_at` on the lead row regardless.

**Commit:** `b9f2d40`

---

## 2. Side panel polish

Five related improvements to the lead side panel + detail page.

### 2a. Cascade-delete call_logs when activity is deleted (`e089251`)

When a status change triggers an auto-call-log (status in called/voicemail/no_answer/wrong_number/sold_already), deleting the resulting "call_logged" activity entry previously orphaned the `call_logs` row. Now linked via `activity_logs.metadata.call_log_id` at write time; the activity DELETE handler cascades the call_logs delete. Applies to both manual call logs (`/api/leads/:id/calls`) and auto-logged status changes.

### 2b. Editable contact_state + company_state (`e089251`)

`custom_fields.contact_state` was imported by CSV but read-only in the side card. Added dropdowns for both `contact_state` and `company_state` (50 US states + DC) in the existing Edit / Save flow. New file `lib/us-states.ts`. The PATCH `/api/leads/:id` route accepts both at the top level and merges them into `custom_fields` without clobbering other keys.

### 2c. Reset status to 'new' when last call is deleted (`fbb2b3a`)

Trigger extension: when `sync_lead_last_contacted` sees zero remaining `call_logs` after a delete, AND the lead's status is one of the call-outcome statuses (called/voicemail/no_answer/wrong_number/sold_already), reset status to 'new'. Manual statuses (interested, do_not_contact, etc.) are never touched. Works on any call_logs DELETE path — both the activity-cascade and direct call-delete.

### 2d. Log Call → sync status (`e09853b`)

Manual call logging from the Calls tab inserted call_logs + activity_logs but left `lead.status` untouched (only the inverse PATCH path auto-created the call_logs). Added `OUTCOME_TO_STATUS` map mirroring `STATUS_TO_CALL_OUTCOME`; route updates the lead status + writes a `lead_status_changed` activity entry with `metadata.auto_from_call: true`.

| Outcome | Status set |
|---|---|
| Answered | called |
| Voicemail | voicemail |
| No answer | no_answer |
| Wrong number | wrong_number |
| Callback requested | called |

### 2e. Notes can be assigned

See section 13.

---

## 3. Activities list color-coded by past / today / future

`fmtDate()` in `activities-client.tsx:52-64` now returns `{ label, bucket: 'past' | 'today' | 'future' }`. Row tints:
- **Past (open)** → red tint + red left-border
- **Today (open)** → amber tint + amber left-border
- **Future (open)** → no tint
- **Done** → opacity-40 (unchanged)

Selection / linger / hover states still override the bucket tint. Calendar view untouched.

**Commit:** `503e888`

---

## 4. Open item #6 — strip `ai_usage_logs.cached`

The `cached` column was declared in repo migration `20260507000014_ai_tables.sql` but never made it to prod. The caching feature it tracked (`lib/ai/cache.ts`) was deleted months ago.

- Removed `cached` column from the repo migration so blueprint matches prod.
- Dropped the `.eq('cached', false)` filter at `app/api/admin/overview/route.ts:88` — it was silently failing in prod since the AI cleanup commit. The Analytics overview's month-to-date AI cost/tokens are now correct.
- Deleted the obsolete "Schema note" comment in `lib/ai/usage.ts`.
- Marked §14 item 6 and §3 schema-quirk as resolved in the prior handoff.

No production migration needed — we made repo match prod, not the other way round.

**Commit:** `bb25860`

---

## 5. Open item #5 — users-lookup RPC

Replaced `lib/users-cache.ts` (30s-cached `auth.admin.listUsers()` full-project scan) with two SECURITY DEFINER RPCs in migration `20260512000003_users_lookup_rpcs.sql`:

- `get_users_by_ids(workspace_id, uuid[]) → jsonb` — inner-joins `workspace_members` so the result is workspace-scoped. Granted to `authenticated` + `service_role`.
- `get_user_by_email(text) → jsonb` — single user lookup. Used by invite/accept flows which run before membership exists. **Service-role only** to prevent email enumeration from the `authenticated` role.

New `lib/users.ts` wraps the RPCs with the same public surface (`getUsersById`, `getUsersByIdsFull`, `findUserByEmail`) — 11 callsites just swap the import path. `getUsersById/Full` now take a `workspaceId` argument; every callsite already had one in scope.

`lib/users-cache.ts` and the `invalidateUsersCache()` call in `accept-invite/route.ts` deleted. Net diff +191 / -118.

**Commit:** `f2bb6b0`

---

## 6. Open item #3 — denormalize `last_contacted_at` + `last_call_outcome`

Eliminates the `call_logs` join from `/leads` and `/pipeline`. Migration `20260512000004_denormalize_last_contacted.sql`:

- `ALTER TABLE leads ADD COLUMN last_contacted_at timestamptz, last_call_outcome call_outcome`.
- Index `(workspace_id, last_contacted_at DESC NULLS LAST) WHERE deleted_at IS NULL`.
- Backfill via `DISTINCT ON (lead_id) ... ORDER BY called_at DESC` from `call_logs`.
- Trigger function `sync_lead_last_contacted` on `AFTER INSERT / UPDATE OF (called_at, lead_id, outcome) / DELETE` on `call_logs`. Handles all three ops including the `lead_id` reassignment edge case.
- `get_workspace_leads_json` updated to return both columns.

Page changes: `/leads/page.tsx` and `/pipeline/page.tsx` no longer fetch `call_logs`; they read `lead.last_contacted_at` / `lead.last_call_outcome` directly from the RPC result.

Bonus extension shipped later (`fbb2b3a` — see §2c): the trigger also resets status to `new` when the last call is deleted.

**Commit:** `e8b7463`

---

## 7. Open item #4 — analytics aggregate RPCs

Four routes (`time-series`, `email-metrics`, `funnel` rep-branch, `reps`) had a `.range(0, 99999)` band-aid that doesn't bypass PostgREST's 1000-row cap. They silently capped at 1k rows. Migration `20260512000005_analytics_aggregate_rpcs.sql` adds four jsonb-returning RPCs mirroring the proven `get_batch_analytics()` pattern:

| RPC | Replaces |
|---|---|
| `get_time_series_analytics(ws, start, end, rep_id?, campaign_id?)` | time-series route — gap-filling via `generate_series()` |
| `get_email_metrics_analytics(ws, start, end, rep_id?)` | email-metrics route — totals + 4 rates in one pass |
| `get_leads_status_counts_for_rep(ws, user_id) → TABLE` | funnel route rep branch (admin branch already had an RPC) |
| `get_reps_analytics(ws, start, end)` | reps route — per-rep + overall stats, names stitched in via `getUsersByIdsFull` |

Each route shrinks to a single `.rpc()` call. No new indexes needed — existing `idx_emails_analytics`, `idx_emails_rep_analytics`, `idx_call_logs_workspace`, `idx_follow_ups_due` all cover the predicates.

Smoke-tested `get_reps_analytics` for the Summit workspace — returned 31 calls (5 answered / 25 voicemail), 3,008 leads, 15 follow-ups for Ruven.

**Commit:** `657e12a`

---

## 8. Open item #2 — pipeline trim + server search

### Foundation: `last_activity_at` denorm (migration `20260512000007_denormalize_last_activity.sql`)

Needed for pipeline sort. New column on `leads`, fed by triggers on `call_logs`, `emails` (`sent_at`), `notes` (excluding soft-deleted). One shared helper `recompute_lead_last_activity(lead_id)`. Backfilled 26 of 3,009 rows. `get_workspace_leads_json` now returns the column too.

### Pipeline trim (migration `20260512000008_pipeline_trim_rpcs.sql`)

- **`get_pipeline_leads_json(ws, assigned_to?, per_stage_limit, search?)`** → `{leads, counts, totals}` jsonb. Top N per stage via `ROW_NUMBER() OVER (PARTITION BY pipeline_stage_id ORDER BY coalesce(last_activity_at, updated_at) DESC) <= N`. Excludes `do_not_contact` / `unsubscribed`. `counts` is per-stage totals; `totals` rolls up total_leads / hot_leads / deals_won / deals_in_progress for the stat cards.
- **`get_pipeline_stage_overflow(ws, stage, assigned?, limit, offset)`** → next N for one stage. Used by "+N more".

Routes:
- `GET /api/pipeline/search?q=...` — debounced server-side search (returns same shape). Scoped to leads in any pipeline stage (excludes terminal statuses).
- `GET /api/pipeline/stage-overflow?stage_id=...&offset=N` — load next 100 for one stage.

Client (`pipeline-client.tsx`):
- Search wired to debounced fetch (300ms) with a tiny spinner.
- Stat cards driven by server `totals` (accurate across workspace, not just visible cards).
- Per-stage count from server `counts`. **+ N more** button at the bottom of each column when total > visible.
- Drag-drop unchanged. `router.refresh()` after each move re-fetches the trim.

**Commit:** `cb5368c`

---

## 9. Open item #1 — server-side pagination for `/leads`

The biggest piece. Before: server returned up to 20k leads via `get_workspace_leads_json`, client filtered/sorted/paginated. At 3k = ~1 MB payload per page view, projected ~3–5 MB at 10k.

### Migration `20260512000009_leads_page_rpcs.sql`

Three RPCs:

**`get_workspace_leads_page(...)`** → `jsonb { rows, total_count, status_counts }`. Marked `VOLATILE` (not STABLE) because it uses `CREATE TEMP TABLE` for the no-status-filtered intermediate set. Takes every filter + sort + limit/offset. Dynamic sort column via `format()` + `EXECUTE`. `status_counts` ignores the `statuses` filter so the status bar shows accurate totals even when one is selected.

**`bulk_update_leads_by_filter(...)`** and **`bulk_delete_leads_by_filter(...)`** — "Select All Matching" pattern. Server takes the filter spec, resolves matching leads, applies the update/delete in one shot. No 10k IDs over the wire.

### Server (`app/(dashboard)/leads/page.tsx`)

Async server component now reads `searchParams` (q, status, interest, batch, assigned, my, cold, from, to, sort, dir, page, per), passes everything to the page RPC, returns `{leads, totalCount, statusCounts, page, perPage}` as props.

### Client (`leads-client.tsx`) — substantial refactor

- Dropped `applyFilters` / `sortLeads` / page-slicing functions. The server-returned `leads` IS the page.
- Receives `totalCount`, `statusCounts`, `page`, `perPage` from props.
- `router.replace` → `router.push` so filter mutations re-run the server component.
- Per-page selector: `25 / 50 / 100 / All` (All = sentinel `0`, server caps at 50k).
- New `selectAllMatching` state. When on, bulk handlers send the filter spec, not IDs.
- `router.refresh()` after every status/interest/bulk/delete mutation (always-accurate counts — user-chosen tradeoff over snappier-but-stale).
- Status bar `totalCount` derived from sum of server `status_counts`.

### Bulk endpoint (`app/api/leads/bulk/route.ts`)

PATCH and DELETE both accept either `{ ids: [...] }` or `{ scope: 'all_matching', filter: {...} }`. Dispatches accordingly. Activity-log inserts still happen in 200-row chunks.

### Misc

- Last Activity column header is sortable again now that `last_activity_at` works (was disabled per user request when broken — `f8feeab` re-enabled it).
- `handleExport` now exports only the current page (full-set streaming export is a separate ticket).

**Commit:** `f266f2f` (main shipment), with follow-up polish in `90db90c` (bulk bar visible in select-all mode), `794bd85` (visual checkboxes stay checked in select-all mode), `56dcc19` (restore All option).

---

## 10. `/leads` follow-ups

Polish that landed across multiple commits after the user tested `f266f2f`:

- **`90db90c`** — Bulk action bar was disappearing when user clicked "Select all N matching" because `selectedIds` was cleared (we operate by filter spec on the server). Now `BulkActionBar` receives `selectAllMatching ? totalCount : selectedIds.size`.
- **`794bd85`** — Page checkboxes blanked when entering Select-All-Matching mode (selectedIds was empty). Now compute `visualSelectedIds = selectedIds ∪ pageLeads` so all visible rows appear checked. Clicking an individual checkbox while in matching-mode collapses back to a normal page-level selection minus that one row.
- **`56dcc19`** — Restored "All" as a fourth page-size option (25/50/100/All). 50k hard cap server-side. URL: `?per=all`.
- **`f8feeab`** — Last Activity column cell label changed from "Last contacted X ago" to "Last activity X ago" (the column reflects all activity, not just calls). Header sortable again.

---

## 11. Dashboard: unique-leads-vs-target metric

User report: a rep dialing the same lead twice was double-counting against their daily target. Migration `20260512000010_unique_leads_called.sql` adds a tiny RPC:

```sql
get_unique_leads_called(workspace_id, user_id, since) → bigint
-- count(DISTINCT lead_id) FROM call_logs WHERE workspace=... AND logged_by=... AND called_at >= since
```

Dashboard's "Calls Today" card renamed to **"Leads Called Today"** with description "unique leads vs. target". Uses the RPC. Same rep dialing the same lead 3 times → +1 against target, not +3.

**Commit:** `a682c17`

---

## 12. Rep Performance: Today/Target + Day/Week/Month nav

Two commits.

### `95c765c` — Add "Today / Target" column

New batch RPC `get_unique_leads_called_by_rep(ws, since)` (migration `20260512000011_unique_leads_called_by_rep.sql`). `/api/admin/rep-performance` route fetches it + workspace settings (default target + per-rep overrides). Each rep row in the response gains `leadsCalledToday` and `dailyCallTarget`.

Frontend table gets a new column right after the rep name showing `X / 100` with a thin progress bar that turns emerald when target is met.

### `2d1100b` — Date navigation across periods

Range-bounded variant `get_unique_leads_called_by_rep_range(ws, start, end)` (migration `20260512000012_unique_leads_called_by_rep_range.sql`).

UI:
- Period toggle relabelled **Day / Week / Month** (was Today / This Week / This Month).
- Date stepper: `[<]  Mar 4 – 10  [>]` between the period buttons.
- "Today" button appears only when not on the current period.
- Forward arrow disables once on today / this week / this month.
- Switching period snaps anchor back to today.

API now accepts `?period=day|week|month&date=YYYY-MM-DD`. All other metrics (calls, follow-ups, status changes) are bounded too, so historical week/month views show the correct slice.

Column behavior: **Day view** shows `X / Target` with progress bar; **Week/Month view** shows plain "Leads in period" (daily target doesn't translate cleanly to multi-day spans).

---

## 13. Notes: assign to a teammate

`c8b73bb` (initial), `b2520ae` (tightened admin rules).

Migration `20260512000013_notes_assigned_to.sql`: `ALTER TABLE notes ADD COLUMN assigned_to uuid REFERENCES auth.users(id)`. Partial index for "notes assigned to me" lookups.

API `POST /api/leads/:id/notes` accepts `assigned_to`. Inserts a `notifications` row of type `'mention'` for the recipient (link = `/leads/:id`).

**Authorization rules** (enforced server-side, mirrored client-side in the dropdown):

| Author role | Recipient options |
|---|---|
| Rep | admins / super_admins only |
| Admin | other admins **+** the rep currently assigned to this lead — no other reps |

`/api/leads/:id/full` now returns `role` on each team member so the client can filter. `TeamMember` interface gained an optional `role?` field.

`NoteEditor` takes a `recipients` prop. Both `lead-full-panel.tsx` (side panel) and `lead-detail-client.tsx` (full detail page) compute the eligible recipients using the live `lead.assigned_to` + the author's role.

---

## 14. Click-to-copy email/phone

`f03e266`. New `<CopyableContact>` component in `components/leads/detail/copyable-contact.tsx`. Replaces `<a href="mailto:" />` / `<a href="tel:" />` everywhere in `LeadProfileCard` (primary email + 2/3, primary phone + 2/3, company_phone + company_phone_2):

- Click → copies value, shows a green "Copied" pill for 1.4 s.
- Cmd/Ctrl+click → still follows the href (opens mail app / dialer). OS link handler preserved.
- Right-click → still gets "Copy email address" from the OS menu.

---

## 15. Perf work

User: "switching between pages is going really slow" (1.24 s on dashboard, 448 ms on /leads, etc.).

### `88560c2` — `useTransition` on `/leads`

Wrapped the URL push in `startTransition` so the current page stays interactive while the new server component fetches. Perceptual fix only — actual server time unchanged. Filter changes and page navigation no longer blank the table.

### `79db62d` — Dashboard parallelized

Was waterfalling three sequential `await`s (5 + 2 + 1 queries). Each round-trip adds ~100ms of network overhead. Merged all 8 queries into one `Promise.all`. Saved ~300 ms.

### `e0440e6` — Skeleton `loading.tsx` files

Added `loading.tsx` for `/dashboard`, `/leads`, `/pipeline`. Next.js shows these instantly during navigation, replacing the spinner / blank screen. CallsTodayCard also got skeleton rows instead of "Loading calls…" text.

### `de0569a` — Suspense streaming on dashboard

Extracted the slow `getDashboardMetrics` call into an async `<DashboardStats>` server component wrapped in its own `<Suspense fallback={<StatsRowSkeleton />}>`. Page shell + side widgets render in ~80 ms; stat cards stream in when ready. Other widgets (rep performance, overdue follow-ups) are client components that fetch independently and don't block the shell.

---

## 16. Notifications overhaul

A multi-commit thread that ended with a unified bell for everyone.

### `c3e9834` — Portal panel above side panels

The notification dropdown was anchored inside the sticky header (`z-20`), creating a stacking context. The panel could never render above the lead side panel (`z-50`). Refactored to `createPortal` + fixed positioning computed from the bell's `getBoundingClientRect()`. `z-index: 100`. Repositions on resize/scroll.

Same commit: reps can now see `/settings/notifications` (admin gate removed), and the settings page renders `NotificationsClient` (full history) + `NotificationPreferencesPanel`. Old `/notifications` URL redirects to `/settings/notifications`. Settings index card flipped from `adminOnly: true` → `false`.

### `ee2c4d9` — Close dropdown after navigating

`NotificationItem` gained an optional `onNavigate` callback. The bell's panel passes its `onClose` to it. Clicking a notification routes to the lead AND collapses the dropdown.

### `6687204` — Trim to live types

Notification UI was advertising email-era types (replies, bounces, campaigns, quotas, AI batches) that haven't been emitted in months. Trimmed to the three actually-live types:

- `mention` — note assigned to a teammate
- `follow_up_due` — cron-fired
- `lead_assigned` — admin reassigned a lead

New export `ACTIVE_NOTIFICATION_TYPES` from `components/notifications/types.ts`. Legacy types kept in the TS union (and the DB enum) so old rows still parse — their `NOTIFICATION_META` description is just `"(legacy)"`.

`NotificationPreferencesPanel`: dropped the "Email digest" column (no digest infra exists). Single in-app on/off per type. API `ALL_TYPES` whitelist trimmed in `/api/notifications/preferences/route.ts`.

`NotificationsClient` filter dropdown trimmed to 4 options (All / Mentions / Follow-ups / Lead assigned).

### `eb31686` — Realtime push (the actual bug)

The `notifications` table wasn't in the `supabase_realtime` publication, so INSERTs never streamed to the browser. The rep's bell only updated on page reload. Migration `20260512000014_notifications_realtime.sql`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

The browser-side channel in `notification-context.tsx` already subscribed to `postgres_changes / INSERT` filtered by `user_id=auth.uid` — it just had nothing to listen to.

Same commit: cleaned up the notifications page's "Notification types" legend at the bottom (was rendering ALL of NOTIFICATION_META including legacy types — now uses `ACTIVE_NOTIFICATION_TYPES`). The dead-end "Manage what you are notified about in [Notification preferences]" link (which pointed to the same page) replaced with "Scroll down for notification preferences."

### `715f77b` — One bell for everyone

Reps were rendering `<FollowUpBell />` instead of `<NotificationBell />` (header.tsx had a `role === 'rep' ? FollowUpBell : NotificationBell` ternary). My notification work — realtime, portal, mentions — never reached reps because they weren't seeing that component.

Replaced with a unified bell that shows BOTH:

- **Activities at the top** of the dropdown:
  - 🔴 Overdue (red, AlertTriangle icon)
  - 🟡 Today (amber, Calendar icon)
  - ⚪ Upcoming (next 7 days, capped at 5, muted)
- **Notifications below** (mentions, follow_up_due, lead_assigned)

Activity rows click through to the lead and collapse the dropdown.

`/api/activities/due` now returns `{ overdue, dueToday, upcoming, count }` (was `{ overdue, dueToday, count }`). `upcoming = (today, today+7]`, server-capped at 50 rows total. Badge `count` = overdue + today (upcoming is FYI only).

`FollowUpBell.tsx` left on disk but unimported — easy to bring back if the unified bell turns out too dense.

### `b2520ae` — Admins can only ping the lead's own rep

Tightened the assign-note rules (mentioned in §13). Admins were previously allowed to ping any rep; now they can only ping (a) other admins, (b) the rep currently assigned to this lead. Enforced server-side in `/api/leads/:id/notes` AND mirrored in the dropdown filter.

---

## 17. Quirks worth remembering

### Header stacking context

`<header>` is `sticky top-0 z-20`. Sticky positioning creates a new stacking context, so any `z-50` element inside the header is **still bounded by z-20** when stacked against sibling elements outside. The lead side panel (`fixed z-50`) lives outside the header and rendered later in the DOM, so it always covered any header dropdown — regardless of inner z-values. Fix: portal the dropdown to `document.body` with `position: fixed`.

### `notifications` table needs to be in the realtime publication

By default, Supabase doesn't add new tables to `supabase_realtime`. If a table needs its inserts to stream to clients, add it explicitly:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>;
```

Symptom is "the data is in the DB but the UI doesn't update until refresh". Affected `notifications` this session.

### `STABLE` functions can't `CREATE TEMP TABLE`

`get_workspace_leads_page` initially failed at runtime with `ERROR: 0A000: CREATE TABLE AS is not allowed in a non-volatile function`. STABLE means side-effect-free; temp tables count as a side effect. Solution: mark the function `VOLATILE`. Slight optimizer-cost change, but only matters if it's called from another SQL expression that needs stability guarantees. RPC calls from the route are unaffected.

### Postgres `row_to_jsonb` ≠ `to_jsonb`

There's `row_to_json` (json, not jsonb) and `to_jsonb` (jsonb). There is **no** `row_to_jsonb`. The page RPC errored at runtime; fix was to use `to_jsonb(p)` inside the dynamic SQL.

### Sticky-positioned ancestors break z-index expectations

See header stacking context above — `position: sticky` and `position: fixed` both create stacking contexts. Generally portal anything that should appear above ad-hoc fixed UI.

### Reps used to see a different bell entirely

Pre-`715f77b`, `<FollowUpBell />` was a separate component that only knew about `follow_ups` (no notifications system). If you ever find rep-only features that don't seem to work in the bell, double-check whether they're shipping through the unified `NotificationBell` or the (now-unimported) `FollowUpBell`.

### Auto-mode classifier blocks MCP prod migrations / git pushes

Several times this session the Claude Code auto-mode classifier rejected `apply_migration` calls and `git push` to `main` even after the user confirmed via `AskUserQuestion`. Worked around either by (a) the user turning off auto mode, (b) the user running `git push` themselves with the `! ` prefix, or (c) applying the migration via the Supabase SQL editor in the browser. None of these are great — keep an eye out for the same friction on future migrations.

### Schema-drift pattern (recurring theme)

`ai_usage_logs.cached` was declared in repo migration but missing in prod. Today's Bad Lead bug had a different drift: the `unsubscribes` table's `email NOT NULL` constraint was deployed long ago and forgotten; the `sync_lead_unsubscribe` trigger that depended on `NEW.email` being non-null was added later without re-checking. **Before adding columns to inserts based on what the repo migration says, verify the column exists in the live DB. Before adding triggers that reference rows in other tables, verify their constraints.**

---

## 18. Open items / future work

### Verified clean (closed in this session)

- ✅ §14 #1 — `/leads` server-side pagination (`f266f2f`)
- ✅ §14 #2 — pipeline server-side trim (`cb5368c`)
- ✅ §14 #3 — denormalize `last_contacted_at` (`e8b7463`)
- ✅ §14 #4 — analytics 4 routes (`657e12a`)
- ✅ §14 #5 — users-lookup RPC (`f2bb6b0`)
- ✅ §14 #6 — `ai_usage_logs.cached` drift (`bb25860`)

### New things flagged for later

1. **CSV export of all matching leads** (not just current page). Would need a streaming endpoint — currently `handleExport` in `leads-client.tsx` only exports the visible page.
2. **Email-digest infra** — `notification_preferences.email_digest` column is still in the DB and writable via API, but no cron sends digests. Either restore the digest sender OR drop the column.
3. **`FollowUpBell` component** is on disk but unimported. If the unified bell feels too dense after rep usage, bring it back as a secondary widget OR delete the file.
4. **`get_workspace_leads_json` RPC has schema drift in the repo** — it lives only in the deployed DB. We touched it twice this session (last_contacted_at, last_activity_at) but neither change is captured in repo migrations. Worth backfilling a migration that declares the RPC explicitly so it survives a fresh-DB rebuild.
5. **Legacy notification types in the DB enum** — `bounce`, `campaign_complete`, `reply_received`, `quota_warning`, `task_reminder`, `unsubscribe` are all dormant. Safe to drop after confirming no rows reference them.
6. **`last_activity_at` index isn't used by `/leads` sort yet** — sortable in the UI but no `ORDER BY last_activity_at` path uses the index because the page RPC sorts via dynamic SQL on a computed column. If sort-by-last-activity becomes hot, switch to a static sort or add a covering index.
7. **`notification_preferences` whitelist mismatch** — server-side `ALL_TYPES` in `/api/notifications/preferences/route.ts` now matches the live types, but `notification_preferences` rows for the old (legacy) types may still exist in the DB. They're inert (no UI shows them, no code reads them) but a cleanup pass would simplify the table.

### Test surface for the next session

- All 11 callsites of `users-cache → users` (`getUsersById` / `getUsersByIdsFull` / `findUserByEmail`)
- All 4 analytics routes at >1k row workloads
- "Select all matching" → bulk status / assign / delete with various filter combos
- Notification realtime in two browsers (admin assigns → rep's bell should pop immediately, no refresh)
- Note assignment cross-role: rep → admin (allowed), admin → assigned rep (allowed), admin → other rep (403)
- Pipeline drag-drop with "+N more" expanded
- `/leads` page-switch latency on 10k synthetic data (we tested at 3k)

---

**Migration files added this session** (all applied to prod via Supabase MCP):

1. `20260512000002_fix_unsubscribe_trigger_null_email.sql`
2. `20260512000003_users_lookup_rpcs.sql`
3. `20260512000004_denormalize_last_contacted.sql`
4. `20260512000005_analytics_aggregate_rpcs.sql`
5. `20260512000006_reset_status_on_last_call_delete.sql`
6. `20260512000007_denormalize_last_activity.sql`
7. `20260512000008_pipeline_trim_rpcs.sql`
8. `20260512000009_leads_page_rpcs.sql` (re-applied once to fix `STABLE` → `VOLATILE` + `row_to_jsonb` → `to_jsonb`)
9. `20260512000010_unique_leads_called.sql`
10. `20260512000011_unique_leads_called_by_rep.sql`
11. `20260512000012_unique_leads_called_by_rep_range.sql`
12. `20260512000013_notes_assigned_to.sql`
13. `20260512000014_notifications_realtime.sql`

13 migrations / 30 commits / 0 production migrations applied without explicit user authorization.

---

## 19. Email snapshot polish

Five small commits that ended a thread starting from "the snapshot output looks wrong":

### 19a. `058b744` — Switch Gmail → Outlook

`buildGmailComposeUrl` → `buildOutlookComposeUrl`. Generated URL now points at `https://outlook.office.com/mail/deeplink/compose?subject=…&body=…`. Personal `outlook.com` accounts are auto-redirected by Microsoft. The Unicode-bold trick (mathematical sans-serif bold glyphs for `Revenue:`, `Company Snapshot`, etc.) still renders bold in Outlook so no visual regression.

UI text flipped in `components/leads/detail/questionnaire.tsx`:
- Button label `"Open Gmail draft"` → `"Open Outlook draft"`
- Tooltip on the AI-generate button updated
- Tooltip on the ready anchor updated

### 19b. `714842d` — Rewrite the fallback template to match the AI's "Company Snapshot" format

User saw two side-by-side outputs: one in ugly ALL-CAPS sections with box-drawing dividers (`FINANCIAL OVERVIEW / OPERATIONS / SERVICE MIX`), one in clean `Company Snapshot / Revenue: / Team:` sentence-case bullets. The first was the deterministic fallback in `lib/intake-snapshot.ts buildSnapshot()`. The second was the AI output. Same input, two formats — happened whenever the AI call failed for any reason.

Rewrote `buildSnapshot()` to mirror the AI prompt's `STYLE_EXAMPLE`:

- `"Hi,"` opener
- `"We have an HVAC opportunity that may be a fit for your platform."` pitch
- 1–2 sentence narrative (company name, geography, years, primary offering)
- `"Company Snapshot"` heading
- Title Case section labels with colons (Revenue, EBITDA, Team, Market Mix, Service Mix, Job Profile, Project History, Geography, Years in Operation, Ownership, Additional Notes)
- Indented bullets (two spaces, no dash glyph)
- Polite sign-off line

Sections with no data are skipped entirely.

### 19c. `fc84cd4` — Copy snapshot button (the `fc84cd4` commit also covers the multi-assign work; see §20)

`prepareSnapshotEmail` now returns `{ url, body, subject }` instead of just `url`. After "Email Snapshot" finishes loading, two buttons render side by side:

- Emerald **Open Outlook draft** anchor (existing)
- Neutral **Copy snapshot** button — copies the styled body to clipboard, flips to "Copied" (emerald) for 1.8 s, falls back to `window.prompt()` if the clipboard API is blocked.

Editing any intake field clears both URL and body so the user has to regenerate (otherwise a stale snapshot could ship with new data).

### 19d. `a9c573a` — Save button anchored at the bottom (always)

Earlier we'd moved Save out of the header to a row above "Add custom question". When the user expanded "Add question" the Save block ended up sandwiched in the middle of the form. Swapped so the order is: form fields → Add question → Save. Save is now always the very last block in the questionnaire body.

### 19e. `32473f2` — Surface fallback-to-template state

`ai_usage_logs` had only 2 rows at this point in the session, both from 2026-05-11. Snapshots generated 2026-05-12+ left no rows because `/api/ai/snapshot-email` was returning 503 in production (env vars not set) and the client was silently falling back to the offline template. From the user's perspective the snapshot button "worked" — they just kept seeing the older ugly format, and the `/settings/ai-usage` page stayed empty.

Change makes the failure visible:

- `prepareSnapshotEmail` return shape gained `source: 'ai' | 'template'` and `error: string | null`.
- The questionnaire now shows an amber **"Template (AI down)"** badge next to the action buttons whenever the fallback ran, with the server's error message in the hover and in the inline error text. The hint reads: *"AI unavailable: <err>. Used offline template (not logged to /settings/ai-usage)."*

**Action required to actually fix `/settings/ai-usage`:** set the two env vars in the production deployment (Vercel dashboard or wherever the app runs):

```
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_FEATURE_AI=true
```

Redeploy. Generate a snapshot. The amber badge should disappear and a fresh row should land in `ai_usage_logs` (~$0.01 per snapshot at gpt-4o pricing).

---

## 20. Notes multi-assign + intake Save

`fc84cd4` bundled the multi-assign rewrite with the snapshot copy/save changes.

### 20a. Multi-select recipient dropdown

NoteEditor's "Assign to" went from a native `<select>` (single-select) to a `DropdownMenu` styled to match the other side-panel dropdowns (status pill / interest pill):

- Outline pill button with chevron, popover content with checkable items
- `e.preventDefault()` on item click → menu stays open while toggling multiple recipients
- Trigger label adapts: `"Assign to…"` (none) → `"Daniel Glazy"` (one) → `"3 people"` (many)
- Added "Clear selection" item when at least one recipient is picked

### 20b. Server fan-out

`POST /api/leads/:id/notes` schema widened: `assigned_to: string | string[] | null`. The route:

1. Normalises to a deduped array.
2. Validates every recipient (same role rules — reps → admins only; admins → other admins or the rep currently assigned to this lead).
3. Inserts the note **once**, with the **first** recipient stored in `notes.assigned_to` for back-compat with the single-column schema.
4. Fans out one `mention` notification per non-self recipient. Self-assignment is allowed but the notification insert skips that ID.

`onSave` signature on the editor widened from `(content, string | null)` to `(content, string[])`. Both callers (`lead-full-panel`, `lead-detail-client`) updated.

No DB migration was needed — the fan-out lives entirely in notification rows.

---

## 21. Houston decoupling — project moved to `~/Desktop/SummitCRM`

2026-05-13. The project used to live at `/Users/glazy/.dev-houston/workspaces/Glazy/Summit/SummitCRM`, a directory created and managed by Houston (a local Tauri app at `~/houston/`). The user found the location hard to find and wanted to step away from Houston.

### 21a. What was running in the background

Before cleanup there were **10 `houston-engine` debug binaries** all listening on their own localhost ports, accumulated over 8 days because closing the Houston UI never killed the Rust engine subprocess. Only PID 22042 (port 54230) matched the live `engine.json`; the other 9 were orphans. All 10 were killed.

### 21b. The move

1. Killed `next dev` (PID 86476) + the postcss helper.
2. Killed PID 22042 (the live houston-engine).
3. Removed the existing `~/Desktop/SummitCRM` symlink (it had pointed to the `.dev-houston` path).
4. `mv /Users/glazy/.dev-houston/workspaces/Glazy/Summit/SummitCRM /Users/glazy/Desktop/SummitCRM` — now the real folder, not a symlink.
5. Deleted `.next/` and `tsconfig.tsbuildinfo` (both bake absolute paths).
6. Verified `package.json`, `.env.local`, `.git/`, `.vercel/project.json`, `next.config.ts`, `tsconfig.json` all present.
7. `git -C ~/Desktop/SummitCRM status` clean on `main` — history intact.
8. Smoke test: `npm run dev` boots in 367ms, loads `.env.local`. ✓

### 21c. Auto-memory migration

Claude's auto-memory directory is keyed off the cwd. Moved:

```
~/.claude/projects/-Users-glazy--dev-houston-workspaces-Glazy-Summit-SummitCRM/memory/
  →
~/.claude/projects/-Users-glazy-Desktop-SummitCRM/memory/
```

`feedback_working_directory.md` was rewritten — the old rule ("use the `.dev-houston` path, not the Desktop symlink") is dead. New rule: the Desktop folder IS the project. Future Claude sessions opened from `~/Desktop/SummitCRM` will pick up the migrated memory automatically.

### 21d. What still references the old path (mostly harmless)

- `~/.dev-houston/workspaces/Glazy/Summit/` — empty Houston workspace shell. Houston's `workspaces.json` still registers a "Glazy" workspace but the path it points to is gone, so the Houston app will show it as missing if reopened.
- `~/.dev-houston/` overall — engine state, tunnel config, logs. Inert now that no engine is running. `rm -rf ~/.dev-houston` is safe whenever the user is confident they're done with Houston.
- `~/houston/` — Houston's source repo (Tauri + Vite + Rust). Separate from this project; delete if not developing on Houston itself.
- The internal `.houston/` directory inside the project (`~/Desktop/SummitCRM/.houston/`) — activity log, sessions, learnings from the Houston-managed era. No code reads it; safe to `rm -rf` whenever.
- Older HANDOFF / docs sections that mention `.dev-houston` paths — historical references, no action needed.

### 21e. What to do after reopening

- Close the old Cursor window (its workspace pointed at the now-missing path) and reopen from `~/Desktop/SummitCRM`.
- Restart the dev server from the new path: `cd ~/Desktop/SummitCRM && npm run dev`.
- If `vercel` CLI complains about the link, `vercel link` re-binds to the same deployed project — production isn't affected (Vercel builds from git, not from your laptop).

### 21f. What did NOT need touching

- Deployed CRM at the live Vercel URL — runs independently
- Supabase database, RLS, auth, env keys — string-based connection, location-agnostic
- Git remote, history, branches, recent commits (`daab281`, `32473f2`, `a9c573a`, `fc84cd4`, `714842d`)
- `.env.local` — moved with the folder; Next.js picked it up unchanged in the smoke test

---

## What's still open after this session

Mostly unchanged from §18, plus two new flags:

- **AI env vars** — production needs `OPENAI_API_KEY` + `NEXT_PUBLIC_FEATURE_AI=true`. Without these the snapshot feature falls back to the template every time and `/settings/ai-usage` shows nothing. The amber badge in the UI is the user-visible indicator that this is happening.
- **Multi-recipient denorm** — currently the note row only stores the *primary* (first) recipient in `notes.assigned_to`. If we later want to display "this note is assigned to A, B, C" on the lead, we'd need a `note_assignees(note_id, user_id)` join table. Today the multi-assign feature is notification-only.

---

**Updated migration tally:** still 13 migrations / now ~35 commits / 0 production migrations applied without explicit user authorization.

---

## 22. Session 2026-05-13 pm — open-items cleanup + architecture map

Picked up after §21 with a request to walk through everything still flagged in §18. Closed 7 of the 9 items, plus a couple of session-specific asks. 3 new production migrations applied via Supabase MCP (this time with explicit per-step authorization).

### 22a. Snapshot includes company website (`e5c0a59`, `38dff90`, `b80e87c`)

User asked to surface the company website on the AI snapshot. Three small commits:

1. **`e5c0a59`** — added a `Website:` section to the snapshot block (after `Geography`) in both the AI prompt's section order + `STYLE_EXAMPLE` and `lib/intake-snapshot.ts`'s fallback. Initial rendering: bare domain (no protocol).
2. **`38dff90`** — flipped to `https://`-prefixed URL after user reported the link wasn't auto-linkifying in Outlook.
3. **`b80e87c`** — reverted to bare domain after user reported it *still* wasn't clickable in Outlook even with the prefix. Live conclusion: Outlook's compose deeplink body doesn't auto-linkify pasted plain-text URLs reliably. A truly clickable link would need a rich-HTML clipboard write from the **Copy snapshot** button (separate change, not done this session — the Outlook deeplink body itself is plain-text-only and can't carry HTML).

`normalizeWebsite()` helper from `38dff90` was reverted to the original `bareDomain()`.

### 22b. Legacy notification types dropped (§18 #5 + #6) — `c57cd16`

Migration `20260513000001_drop_legacy_notification_types.sql`. Applied via Supabase MCP. Before applying we verified prod state: 1 active `mention` row, 0 preference rows — clean cut. The swap-enum dance was required because Postgres has no `ALTER TYPE ... DROP VALUE`:

1. `DELETE FROM notifications / notification_preferences WHERE type NOT IN (active types)`.
2. `CREATE TYPE notification_type_new AS ENUM ('mention', 'follow_up_due', 'lead_assigned')`.
3. `ALTER TABLE ... ALTER COLUMN type TYPE notification_type_new USING type::text::notification_type_new` on both tables.
4. `DROP TYPE notification_type; ALTER TYPE notification_type_new RENAME TO notification_type`.

`components/notifications/types.ts` was trimmed in the same commit: 9 values → 3 in the `NotificationType` union and `NOTIFICATION_META` map. `notification-item.tsx:22` dropped a `?? NOTIFICATION_META.system` fallback that was now dead code.

**Bonus:** discovered `lib/notifications/create.ts` exports `createNotification` + `notifyAdmins` with **zero callers** anywhere in src. Logged as a candidate for deletion in §22h (the architecture map's roadmap badges).

### 22c. FollowUpBell deleted (§18 #9) — `c57cd16`

`components/notifications/followup-bell.tsx` (214 lines) was unimported since the unified bell shipped in `715f77b`. Deleted in the same commit as the notification cleanup above.

### 22d. Default sort = last_activity_at on `/leads` (§18 #7) — `f8afc04`

Four spots flipped: server default in `app/(dashboard)/leads/page.tsx:97`, client URL-parse default in `leads-client.tsx:89`, URL-serializer condition in `leads-client.tsx:214` (so the default doesn't show up in `?sort=` query params), and `DEFAULT_FILTERS.sortBy` in `components/leads/types.ts:76`. Most-recently-active leads now show first when landing on `/leads` with no sort selected.

### 22e. @mention badge on notes — `f8afc04`

User scope clarification: they explicitly did **not** want the multi-recipient denorm (§18 / `note_assignees` join table) — single primary recipient in `notes.assigned_to` is fine. But they wanted a visible `@Name` indicator on the displayed note so it's clear who it's directed at.

Implementation:

- `app/api/leads/[id]/full/route.ts:40` now selects `notes.assigned_to`, and the per-note entry mapper at line 82 resolves the name via the existing `usersById` map. New fields on the entry: `note_assigned_to` + `note_assigned_to_name`.
- `components/leads/detail/types.ts` — added both optional fields to `ActivityEntry`.
- `components/leads/detail/activity-timeline.tsx` — under the "by [author]" line, renders a small violet chip `→ @Name` when the note has an assignee. Only shown when present.
- Optimistic add paths in `lead-full-panel.tsx:186` and `lead-detail-client.tsx:205` populate the assignee name from `teamMembers` so the `@mention` appears instantly without waiting for a refresh.

### 22f. email_digest column dropped (§18 #8) — `f8afc04`

Migration `20260513000002_drop_email_digest_column.sql` — single line: `ALTER TABLE notification_preferences DROP COLUMN email_digest`. Applied via Supabase MCP.

Code cleanup in the same commit:

- `components/notifications/types.ts` — removed `email_digest` from `NotificationPreference`.
- `components/notifications/notification-preferences-panel.tsx` — three spots (default fallbacks + `update()` field type) trimmed.
- `app/api/notifications/preferences/route.ts` — three spots: GET default response, PATCH zod schema, and upsert object. The whitelist `ALL_TYPES` was already trimmed last session.

Settings UI is unchanged — the digest toggle was already removed from rendering in `6687204` last session; this just closes the loop on the schema.

### 22g. `get_workspace_leads_json` RPC backfilled (§18 #4) — `a5c3bac`

Pulled the current definition out of prod via `pg_get_functiondef`, saved as `supabase/migrations/20260513000003_declare_get_workspace_leads_json.sql`. Applied via Supabase MCP (no-op against the existing function due to `CREATE OR REPLACE`, but registers the migration in the database's history).

Function returns 21 columns now, including `last_contacted_at`, `last_call_outcome`, and `last_activity_at` — these were added in 20260512000004 and 20260512000007 last session via direct edits without a corresponding migration. Smoke-tested by calling the function and confirming 3,008 leads returned.

Grants: `EXECUTE` to `anon, authenticated, service_role`.

### 22h. Architecture map — `architecture-map.html`

User asked to build a one-shot interactive HTML architecture map (spec from `~/Downloads/architecture-map.md`). Produced `architecture-map.html` at repo root: 1,200 lines, 72KB, fully self-contained (no build, no external assets).

**Layout:**
- 6 column-clusters: Client (browser) · Server entry · API routes · Services / libs · Data (Postgres) · External services
- 58 nodes, hand-positioned
- ~80 edges, color-coded by kind (`critical` red · `api` orange · `db` amber · `mount` blue · `normal` grey)
- Filter chips: Overview (default), Snapshot, Leads, Pipeline, Notes, Notifications, Analytics, Admin, Import, Dead code, Show all wires, Roadmap & bugs
- Sidebar: hover or click any node → role, plain-English description, `path:line`, notes, incoming/outgoing edges, fixes

**Critical path:** the AI snapshot flow, 10 numbered red edges from `questionnaire.tsx` → `intake-snapshot.ts` → `/api/ai/snapshot-email` → `ai-tasks.ts` → OpenAI → `ai-usage.ts` → `ai_usage_logs` table, with a parallel branch to the Outlook compose deeplink.

**Roadmap badges (green circles, per node):** open fix counts on `leads-client` (CSV export streaming), `leads-list-route` (export endpoint), `rpc-leads-page` (dynamic-sort indexing risk), `notif-create-dead` (delete the dead file), and `rate-limit` (wire it to the AI route if usage scales).

**Two bugs fixed during the build:**
1. Initial render was a blank canvas — line 643 of the data block had a double-quoted string with unescaped double quotes (`"last contacted"` nested inside `"..."`). Parser aborted before any nodes/edges drew. Swapped to single quotes + curly apostrophe.
2. Pan/zoom-only navigation was hard to use — restructured the layout so the canvas lives inside `#scroll-area` (overflow:auto) at the SVG's natural `1720×1480` size. Native scroll bars now work; Cmd/Ctrl+wheel zooms (cursor-anchored), plain wheel scrolls.

**How to open:** double-click `/Users/glazy/Desktop/SummitCRM/architecture-map.html` or `python3 -m http.server 4747` and visit `http://localhost:4747/architecture-map.html`.

### 22i. Discussion-only items (no code)

- **AI env vars in prod.** Pre-session the amber "Template (AI down)" badge was firing in production despite the user's claim that both env vars were set in Vercel. User confirmed mid-session: after a redeploy the badge went away and `ai_usage_logs` started receiving rows again. Most likely the vars were added *after* the previous build → `NEXT_PUBLIC_FEATURE_AI` was baked into the old bundle as `undefined`. Resolved without code changes.
- **Rate limiting + specific error messages.** User asked what these are and whether they need them. Walked through where rate limits would matter (AI snapshot endpoint cost protection, bulk upload, login — Supabase already does login). User opted not to enable any. `lib/security/rate-limit.ts` already exists with constants — wired into zero routes today. Reserved as future work.

### 22j. Session tally — closed §18 items

| §18 item | Status after this session |
|---|---|
| #1 AI env vars in prod | ✅ Self-resolved via redeploy (no code change) |
| #2 CSV export all-matching | 📋 **Still open** — needs streaming endpoint |
| #3 Multi-recipient note denorm | ✅ Scope dropped (user decided single recipient is fine); `@mention` display shipped instead |
| #4 `get_workspace_leads_json` RPC drift | ✅ Backfilled (`a5c3bac`) |
| #5 Legacy notification types | ✅ Dropped (`c57cd16`) |
| #6 Inert notification_preferences rows | ✅ Dropped (`c57cd16`, same migration) |
| #7 `last_activity_at` default sort | ✅ Shipped (`f8afc04`) |
| #8 Drop `email_digest` column | ✅ Shipped (`f8afc04`) |
| #9 Delete FollowUpBell | ✅ Shipped (`c57cd16`) |

**Open carry-overs:** #2 only.

### 22k. New items discovered

- **`lib/notifications/create.ts` is dead code** — `createNotification` + `notifyAdmins` have zero callers in src. ~110 lines. Safe to delete the file outright. Flagged in the architecture map's roadmap badges.
- **Outlook auto-linkify doesn't fire on plain-text URLs in the compose deeplink** — even with the `https://` prefix. If a clickable website link in the snapshot becomes important, we need a rich-HTML clipboard write on the **Copy snapshot** button (the Outlook deeplink body is plain-text-only and can't help).

### 22l. Migrations applied this session (via Supabase MCP)

1. `20260513000001_drop_legacy_notification_types.sql` — enum swap from 9 → 3 active types.
2. `20260513000002_drop_email_digest_column.sql` — single `ALTER TABLE DROP COLUMN`.
3. `20260513000003_declare_get_workspace_leads_json.sql` — `CREATE OR REPLACE` of the existing prod function (no-op against the live function, registers in migrations history).

**Updated migration tally:** 16 migrations total / ~42 commits / 3 production migrations applied this session, each with explicit user authorization via Supabase MCP OAuth.
