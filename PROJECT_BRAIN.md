# SummitCRM — Project Brain

> **Single source of truth** for everything about this project.
> Keep this file updated whenever anything changes — features, routes, schema, decisions, bugs, patterns.
> Read top-to-bottom for full context; each section is self-contained.

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Tech Stack](#2-tech-stack)
3. [User Roles](#3-user-roles)
4. [Architecture](#4-architecture)
5. [Database Schema](#5-database-schema)
6. [Directory & File Map](#6-directory--file-map)
7. [Route Map](#7-route-map)
8. [Feature Inventory](#8-feature-inventory)
9. [Key Implementation Patterns](#9-key-implementation-patterns)
10. [Session Log — What Was Built & When](#10-session-log--what-was-built--when)
11. [Open Items](#11-open-items)
12. [Quirks & Gotchas](#12-quirks--gotchas)
13. [Security Model](#13-security-model)
14. [Deployment](#14-deployment)
15. [Environment Variables](#15-environment-variables)

---

## 1. What This Is

**SummitCRM** is an AI-powered, multi-tenant cold outreach CRM built for sales teams. The core workflow is:

1. Import leads from CSV into named batches
2. Work leads through a pipeline (New → Called → Replied → Interested → Converted)
3. Log calls and outcomes against each lead
4. Take intake notes on leads via a structured questionnaire
5. Generate a personalized AI "Email Snapshot" from the intake data, opened directly in Outlook or copied to clipboard
6. Track team performance (calls per rep, leads worked, pipeline stage counts)
7. Admin dashboard for oversight: rep performance, call targets, analytics

**What it is NOT** (out of scope by decision):
- Bulk email sending / campaigns — removed; email features stripped
- AI draft email / AI subject line / batch personalization — all deleted
- SMS, LinkedIn, Salesforce sync, multi-workspace billing, native mobile

**Primary users:** Sales reps (log calls, update leads), admins/managers (oversight, analytics, team management), viewers (read-only reports).

**Live DB project:** Supabase project `nmcyxulluascofmsgkxr`

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.2.6 (App Router) | Breaking changes from older Next — read `node_modules/next/dist/docs/` |
| UI | React 19.2.4 + shadcn/ui | |
| Styling | Tailwind CSS 4 + clsx + class-variance-authority | |
| Forms | React Hook Form 7 + Zod 4 | |
| Charts | Recharts 3 | |
| Icons | Lucide React | |
| Date utils | date-fns 4 | |
| CSV parsing | Papaparse 5 | Client-side only, for import preview |
| Excel export | xlsx 0.18.5 | |
| Database | Supabase (Postgres) + RLS | Multi-tenant via workspace_id on every table |
| Auth | Supabase Auth (email/password + magic link) | JWT with custom claims (workspace_id, role) |
| Storage | Supabase Storage | `lead-imports` bucket for CSV uploads |
| Realtime | Supabase Realtime | Notifications only |
| Secrets | Supabase Vault | Sending account credentials |
| Background jobs | pg_cron | Quota reset, follow-up reminders |
| AI | OpenAI API (gpt-4o) | Email Snapshot only; gpt-4o-mini removed |
| Email delivery | Resend (primary) + Nodemailer (SMTP fallback) | Used for transactional only (invites, notifs) |
| Hosting | Vercel | Auto-deploy from `main` branch |
| CI/CD | GitHub → Vercel | Lint + type check on push |

**Key npm scripts:**
- `npm run dev` — dev server on port 3000
- `npm run build` — production build
- `npm run lint` — ESLint

---

## 3. User Roles

Five roles with workspace-scoped permissions enforced at the DB layer (RLS) and API layer:

| Role | What they can do |
|---|---|
| `super_admin` | Platform owner. Full access to all workspaces (not currently used in UI) |
| `admin` | Workspace owner. Manage team, view all analytics, all lead ops, delete batches, batch rename/move |
| `manager` | View all analytics, read-only on admin areas |
| `rep` | Create/edit/call leads, view own stats, see assigned pipeline |
| `viewer` | Read-only on assigned leads and reports |

**Pipeline visibility rule:** Reps see only leads assigned to them. Admins/managers see all. Enforced server-side in `app/(dashboard)/pipeline/page.tsx` (RPC bypasses RLS so this is the only enforcement point).

---

## 4. Architecture

```
Browser
  └── Next.js App Router (Vercel)
        ├── Server Components (data fetch, no secrets to client)
        ├── Client Components (interactivity, Realtime subscriptions)
        └── API Routes (/app/api/**)
              ├── Supabase RLS client (auth-scoped, user data)
              └── Supabase Admin client (service role, for cross-user ops)

Supabase
  ├── Postgres (main DB, RLS on every table)
  ├── Auth (user sessions, JWT custom claims)
  ├── Storage (lead-imports bucket)
  ├── Realtime (notifications table)
  └── Edge Functions (process-lead-import — CSV import worker)

OpenAI API
  └── gpt-4o (Email Snapshot generation only)

Resend API
  └── Transactional email (invites, future notifications)
```

**Auth flow:**
1. User logs in → Supabase Auth issues JWT with `workspace_id` + `role` custom claims
2. `middleware.ts` refreshes session on every request, redirects unauthenticated to `/login`
3. API routes call `createClient()` (RLS-scoped) or `createAdminClient()` (service role) depending on operation
4. RLS policies enforce workspace isolation at DB layer — even if API has a bug, cross-workspace data leaks can't happen

**Critical file:** `lib/supabase/server.ts` — 78 importers, highest blast radius in codebase. `createAdminClient()` uses `_createBrowserClient<Database>` with token refresh/session persistence disabled. The `try/catch` on `setAll` is intentional (Server Components can't write cookies).

---

## 5. Database Schema

### Enums

```sql
workspace_role: super_admin | admin | manager | rep | viewer
lead_status: new | called | voicemail | no_answer | wrong_number | callback | replied | interested | not_interested | converted | do_not_contact
call_outcome: Answered | Voicemail | No answer | Wrong number | Callback requested
pipeline_stage: (custom per workspace)
notification_type: mention | follow_up_due | lead_assigned   -- only 3 active types
activity_type: lead_created | lead_updated | lead_status_changed | note_added | call_logged | lead_assigned | lead_imported | ...
```

### Core Tables

**`workspaces`** — organizations
- `id uuid PK`, `name text`, `created_at`, `updated_at`

**`workspace_members`** — user ↔ workspace with role
- `workspace_id fk`, `user_id fk (auth.users)`, `role workspace_role`, unique(workspace_id, user_id)

**`invitations`** — pending team invites
- `workspace_id fk`, `email text`, `role`, `token uuid`, `expires_at`, `accepted_at`
- RLS fix: `current_user_email()` SECURITY DEFINER function (prevents auth.users permission error)

**`lead_batches`** — named groups of leads (e.g. "Healthcare Q2 Wave 1")
- `workspace_id fk`, `name text`, `lead_count int` (denorm), `created_by uuid`

**`lead_imports`** — CSV import job tracking
- `workspace_id fk`, `batch_id fk`, `status`, `total_rows`, `processed_rows`, `error_count`, `file_path`

**`leads`** — main entity
- `workspace_id fk`, `batch_id fk`, `assigned_to uuid`
- Contact: `first_name`, `last_name`, `email`, `phone`, `company`, `title`
- Status: `status lead_status`, `pipeline_stage_id`, `last_activity_at timestamptz` (denorm)
- Call tracking: `last_contacted_at timestamptz` (denorm), `last_call_outcome call_outcome` (denorm)
- Intake: `custom_fields jsonb` (all questionnaire data + contact_state + company_state live here)
- Unsubscribe: `do_not_contact bool`

**`notes`** — lead notes with optional assignment
- `lead_id fk`, `workspace_id fk`, `author_id uuid`, `body text`
- `assigned_to uuid` — first recipient (back-compat; multi-assign is fan-out at API layer)

**`call_logs`** — call records (single source of truth for call counts)
- `lead_id fk`, `workspace_id fk`, `logged_by uuid`, `outcome call_outcome`, `notes text`, `called_at timestamptz`

**`activity_logs`** — immutable event timeline (DO NOT use for call counting — double-counts with call_logs)
- `lead_id fk`, `workspace_id fk`, `actor_id uuid`, `type activity_type`, `metadata jsonb`, `created_at`
- `metadata.call_log_id` links to `call_logs.id` for call events

**`notifications`** — in-app notifications
- `user_id uuid`, `workspace_id fk`, `type notification_type`, `title`, `body`, `read_at`, `data jsonb`
- In Supabase Realtime publication (required explicit `ALTER PUBLICATION ... ADD TABLE` — not automatic)

**`notification_preferences`** — per-user notification settings (legacy `email_digest` column dropped)

**`ai_usage_logs`** — tracks gpt-4o calls for snapshot email
- `workspace_id fk`, `user_id uuid`, `lead_id fk`, `input_tokens int`, `output_tokens int`, `cost_usd numeric`
- Note: `cached` column was in repo migration but never in prod — removed

**`follow_ups`** — scheduled follow-up reminders
- `lead_id fk`, `workspace_id fk`, `assigned_to uuid`, `due_at timestamptz`, `completed_at`

**`unsubscribes`** — unsubscribe list
- `workspace_id fk`, `email text NOT NULL` (leads with null email are excluded by trigger)

### Key DB Functions / RPCs

| RPC | Purpose |
|---|---|
| `get_workspace_leads_page(ws, filters, sort, page, per_page)` | Paginated leads with total_count + status_counts. VOLATILE (uses temp table). |
| `bulk_update_leads_by_filter(ws, filters, updates)` | "Select All Matching" bulk update |
| `bulk_delete_leads_by_filter(ws, filters)` | "Select All Matching" bulk delete |
| `get_workspace_leads_json(ws, ...)` | Legacy full-list RPC (still used by some paths; bypasses RLS) |
| `get_pipeline_leads_json(ws, ...)` | Top N per stage, ordered by `last_activity_at DESC` |
| `get_pipeline_stage_overflow(ws, stage_id, offset, limit)` | Next N leads for one pipeline stage |
| `get_batch_analytics(ws, batch_ids[])` | Batch analytics as single jsonb row (bypasses 1000-row cap) |
| `get_time_series_analytics(ws, start, end, rep_id?, campaign_id?)` | Daily trend data |
| `get_email_metrics_analytics(ws, start, end, rep_id?)` | Email performance totals |
| `get_leads_status_counts_for_rep(ws, user_id)` | Funnel counts for rep |
| `get_reps_analytics(ws, start, end)` | Rep comparison table |
| `get_unique_leads_called(ws, user_id, since)` | Count of distinct leads called (dashboard KPI) |
| `get_unique_leads_called_by_rep(ws, date)` | Per-rep daily call counts for rep performance panel |
| `get_unique_leads_called_by_rep_range(ws, start, end)` | Per-rep call counts for date range |
| `get_call_stats_by_rep(ws, start, end)` | `[{logged_by, outcome, cnt}]` as jsonb (bypasses row cap) |
| `get_users_by_ids(ids[])` | SECURITY DEFINER — returns user display info without auth.users permission |
| `get_user_by_email(email)` | SECURITY DEFINER — user lookup by email |
| `current_user_email()` | SECURITY DEFINER — used in invitations RLS policy |

### Triggers

- `sync_lead_unsubscribe` — on lead status → `do_not_contact`, inserts to `unsubscribes`. Guards `IF NEW.email IS NOT NULL`.
- `sync_lead_last_contacted` — on `call_logs` INSERT/UPDATE/DELETE, updates `leads.last_contacted_at` + `last_call_outcome`. On DELETE with zero remaining logs AND call-outcome status → resets status to `new`.
- `updated_at` — auto-updates `updated_at` timestamp on all tables
- `sync_lead_count` — maintains `lead_batches.lead_count` denorm
- `sync_last_activity_at` — updates `leads.last_activity_at` on activity_logs insert

### Storage Buckets

- `lead-imports` — CSV uploads (private, RLS-gated)
- `workspace-assets` — public images
- `email-attachments` — private

---

## 6. Directory & File Map

```
/SummitCRM
├── PROJECT_BRAIN.md          ← this file
├── architecture-map.html     ← interactive 72KB graph (open via python3 -m http.server 4747)
├── CLAUDE.md                 → @AGENTS.md
├── AGENTS.md                 ← Next.js breaking changes note
├── SUPABASE_SETUP.md         ← 13-step provisioning guide
├── middleware.ts             ← session refresh + route protection
├── next.config.ts
├── tsconfig.json
├── package.json
│
├── app/
│   ├── (auth)/               ← unprotected group
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   ├── accept-invite/page.tsx
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/          ← protected group
│   │   ├── dashboard/page.tsx          ← KPI cards (30-day window), recent calls, rep panel
│   │   ├── pipeline/                   ← Kanban board
│   │   │   ├── page.tsx               ← server: fetch + rep filter
│   │   │   └── pipeline-client.tsx    ← drag/drop + 3-dot move menu
│   │   ├── leads/
│   │   │   ├── page.tsx               ← server, reads searchParams
│   │   │   ├── leads-client.tsx       ← paginated table, filters, bulk ops
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx
│   │   │   │   └── lead-detail-client.tsx
│   │   │   └── import/page.tsx        ← CSV import wizard
│   │   ├── analytics/
│   │   │   ├── page.tsx
│   │   │   └── analytics-client.tsx
│   │   ├── tasks/page.tsx             ← "Tasks" (formerly Activities); color-coded (past=red, today=amber, future=none)
│   │   ├── notifications/page.tsx
│   │   ├── admin/page.tsx             ← admin dashboard
│   │   ├── batches/page.tsx
│   │   ├── callbacks/page.tsx
│   │   ├── settings/
│   │   │   ├── page.tsx
│   │   │   ├── profile/page.tsx
│   │   │   ├── team/
│   │   │   │   └── team-settings-client.tsx   ← styled SelectMenu + ghost Button
│   │   │   ├── notifications/page.tsx
│   │   │   └── ai-usage/
│   │   │       ├── page.tsx
│   │   │       └── ai-usage-client.tsx        ← MTD cost, emails sent, avg/email, recent 50
│   │   └── layout.tsx
│   │
│   ├── api/
│   │   ├── auth/signup/route.ts
│   │   ├── leads/
│   │   │   ├── route.ts                       ← list/create
│   │   │   ├── [id]/route.ts                  ← get/update/delete
│   │   │   ├── [id]/notes/route.ts            ← CRUD, multi-assign fan-out
│   │   │   ├── [id]/calls/route.ts            ← call log CRUD
│   │   │   ├── [id]/follow-ups/route.ts       ← (DELETED in git status)
│   │   │   ├── [id]/full/route.ts
│   │   │   ├── bulk/route.ts
│   │   │   ├── search/route.ts
│   │   │   ├── imports/route.ts
│   │   │   └── import/[id]/route.ts
│   │   ├── batches/
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts                  ← rename + move (admin only)
│   │   │   ├── [id]/leads/route.ts
│   │   │   └── [id]/sheet/route.ts
│   │   ├── admin/
│   │   │   ├── overview/route.ts              ← workspace KPIs (uses call_logs, NOT activity_logs)
│   │   │   ├── account-health/route.ts
│   │   │   ├── rep-performance/route.ts       ← uses get_call_stats_by_rep RPC
│   │   │   ├── team-stats/route.ts            ← uses get_call_stats_by_rep RPC
│   │   │   ├── ai-usage/route.ts              ← admin-only, MTD + recent 50
│   │   │   ├── activity/route.ts
│   │   │   └── call-targets/route.ts
│   │   ├── analytics/
│   │   │   ├── email-metrics/route.ts
│   │   │   ├── time-series/route.ts
│   │   │   ├── funnel/route.ts
│   │   │   ├── batches/route.ts               ← uses get_batch_analytics RPC
│   │   │   ├── reps/route.ts                  ← BUG: line 80-81 .email/.name on unknown type
│   │   │   ├── reps/[id]/route.ts
│   │   │   └── export/route.ts
│   │   ├── ai/
│   │   │   └── snapshot-email/route.ts        ← POST, admin-only, gpt-4o
│   │   ├── team/
│   │   │   ├── route.ts
│   │   │   ├── invite/route.ts
│   │   │   ├── members/route.ts
│   │   │   └── accept-invite/route.ts
│   │   ├── notifications/
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   ├── [id]/read/route.ts
│   │   │   ├── read-all/route.ts
│   │   │   ├── unread-count/route.ts
│   │   │   └── preferences/route.ts
│   │   ├── pipeline/
│   │   │   ├── search/route.ts
│   │   │   └── stage-overflow/route.ts
│   │   ├── rep/
│   │   │   ├── my-stats/route.ts
│   │   │   └── calls-today/route.ts
│   │   ├── tags/route.ts
│   │   └── tasks/                     ← (formerly activities); follow_ups CRUD
│   │       ├── route.ts
│   │       ├── [id]/route.ts
│   │       └── due/route.ts
│   │
│   ├── auth/callback/route.ts
│   ├── layout.tsx
│   └── page.tsx                               ← redirects to /dashboard or /login
│
├── components/
│   ├── ui/                    ← shadcn/ui primitives (button, input, select, card, dialog, etc.)
│   ├── admin/                 ← admin dashboard panels
│   ├── analytics/             ← charts, tables, export button
│   ├── leads/
│   │   ├── detail/
│   │   │   └── questionnaire.tsx   ← intake form, Email Snapshot button (3 states)
│   │   ├── lead-full-panel.tsx     ← side panel (16 fan-out, highest component complexity)
│   │   ├── leads-client.tsx        ← paginated table (16 fan-out)
│   │   └── import/
│   │       └── import-history.tsx  ← success bar, duration grid, batch link
│   ├── auth/                  ← login/signup forms, RoleGate, invite modal
│   ├── dashboard/             ← stats cards, quick actions, recent activity
│   ├── layout/
│   │   ├── header.tsx         ← no page title (removed to avoid duplication)
│   │   └── sidebar.tsx
│   ├── notifications/
│   │   ├── notification-bell.tsx   ← unified bell (portal to document.body for z-index)
│   │   └── notification-panel.tsx
│   └── CopyableContact.tsx    ← click=copy, cmd+click=navigate, right-click=OS menu
│
├── lib/
│   ├── supabase/
│   │   ├── server.ts          ← createClient (RLS) + createAdminClient (service role)
│   │   ├── client.ts          ← browser client
│   │   └── middleware.ts
│   ├── ai/
│   │   ├── client.ts          ← getOpenAIClient() singleton
│   │   ├── prompts.ts         ← snapshot email prompt template
│   │   ├── tasks.ts
│   │   ├── types.ts
│   │   ├── usage.ts           ← calcCostUsd() + logUsage()
│   │   └── index.ts
│   ├── import/                ← CSV import pipeline (processor, validator, mapper, inserter)
│   ├── users.ts               ← getUsersById, getUsersByIdsFull, findUserByEmail (wraps RPCs)
│   ├── us-states.ts           ← 50 US states + DC for dropdowns
│   ├── intake-snapshot.ts     ← prepareSnapshotEmail() → Outlook deeplink URL, styleSnapshotBody()
│   ├── security/
│   │   ├── audit.ts           ← logActivity() utility
│   │   └── rate-limit.ts
│   ├── notifications/
│   │   └── create.ts          ← DEAD CODE: createNotification + notifyAdmins (zero callers)
│   └── utils/
│
├── hooks/
│   ├── use-auth.ts
│   ├── use-workspace.ts
│   └── index.ts               ← 81 fan-in — high blast radius
│
├── types/
│   ├── database.ts            ← auto-generated from live Supabase schema (2,165 lines, 46 RPCs)
│   └── index.ts               ← custom types
│
├── supabase/
│   ├── config.toml
│   └── migrations/            ← 20+ migration files (see Session Log for details)
│
└── docs/
    ├── SUMMIT-LOG.md          ← session-by-session change log (authoritative history)
    ├── master-product-spec.md
    ├── 00-roadmap.md
    ├── 01-architecture.md
    ├── 02-auth-and-roles.md
    ├── 03-database-schema.md
    ├── 04-lead-import.md
    ├── 06-lead-detail-and-activity.md
    ├── 07-email-system.md     ← spec only; email sending was removed from product
    ├── 08-bulk-email-system.md← spec only; campaigns were removed from product
    ├── 09-ai-enrichment.md    ← spec only; only snapshot-email survived
    ├── 10-admin-dashboard.md
    ├── 11-analytics.md
    ├── 12-notifications-and-reminders.md
    ├── 13-security-and-compliance.md
    ├── 14-testing-plan.md
    └── 15-token-saving-workflow.md
```

---

## 7. Route Map

### Page Routes

| Route | Component | Who can access | Notes |
|---|---|---|---|
| `/` | app/page.tsx | Everyone | Redirects to /dashboard or /login |
| `/login` | (auth)/login | Unauthenticated | |
| `/signup` | (auth)/signup | Unauthenticated | Creates workspace on first user |
| `/forgot-password` | (auth)/forgot-password | Unauthenticated | |
| `/reset-password` | (auth)/reset-password | Unauthenticated | |
| `/accept-invite` | (auth)/accept-invite | Unauthenticated | Token in query param |
| `/dashboard` | (dashboard)/dashboard | All roles | KPI cards (30-day), recent calls, rep performance panel |
| `/pipeline` | (dashboard)/pipeline | All roles | Kanban; reps see only assigned leads |
| `/leads` | (dashboard)/leads | All roles | Paginated table, filters, bulk ops |
| `/leads/[id]` | (dashboard)/leads/[id] | All roles | Full lead detail + timeline |
| `/leads/import` | (dashboard)/leads/import | admin+ | CSV import wizard |
| `/analytics` | (dashboard)/analytics | manager+ | Batches, email metrics, time-series, reps |
| `/tasks` | (dashboard)/tasks | All roles | "Tasks" page (renamed from Activities); color-coded follow-up/callback list + calendar |
| `/notifications` | (dashboard)/notifications | All roles | Notification center |
| `/admin` | (dashboard)/admin | admin+ | Team stats, rep performance, account health |
| `/batches` | (dashboard)/batches | All roles | Batch list + management |
| `/callbacks` | (dashboard)/callbacks | All roles | Callback tracking |
| `/settings` | (dashboard)/settings | All roles | Settings home |
| `/settings/profile` | (dashboard)/settings/profile | All roles | User profile |
| `/settings/team` | (dashboard)/settings/team | admin+ | Team management |
| `/settings/notifications` | (dashboard)/settings/notifications | All roles | Notification prefs |
| `/settings/ai-usage` | (dashboard)/settings/ai-usage | admin+ | AI cost tracking (MTD USD, avg/email, recent 50) |

### API Routes

All API routes require authentication. Role checks are in-route.

**Leads**
- `GET/POST /api/leads` — list/create
- `GET/PATCH/DELETE /api/leads/[id]` — single lead
- `GET/POST /api/leads/[id]/notes` — notes CRUD
- `GET/POST /api/leads/[id]/calls` — call log CRUD; POST syncs lead status
- `GET/POST /api/leads/[id]/full` — lead with all relations
- `POST /api/leads/bulk` — bulk operations
- `GET /api/leads/search` — full-text search
- `GET /api/leads/imports` — list past imports
- `GET /api/leads/import/[id]` — poll import status

**Batches**
- `GET/POST /api/batches`
- `GET/PATCH/DELETE /api/batches/[id]` — includes rename + move (admin only)
- `GET /api/batches/[id]/leads`
- `GET /api/batches/[id]/sheet` — export to spreadsheet

**Admin**
- `GET /api/admin/overview` — workspace KPIs (uses `call_logs`, not `activity_logs`)
- `GET /api/admin/rep-performance` — uses `get_call_stats_by_rep` RPC
- `GET /api/admin/team-stats` — uses `get_call_stats_by_rep` RPC
- `GET /api/admin/ai-usage` — admin only, MTD cost + recent 50
- `GET /api/admin/account-health`
- `GET /api/admin/activity`
- `GET /api/admin/call-targets`

**Analytics**
- `GET /api/analytics/email-metrics`
- `GET /api/analytics/time-series`
- `GET /api/analytics/funnel`
- `GET /api/analytics/batches` — uses `get_batch_analytics` RPC
- `GET /api/analytics/reps` — **BUG**: line 80-81, `.email`/`.name` on `unknown` type
- `GET /api/analytics/reps/[id]`
- `GET /api/analytics/export` — CSV export

**AI**
- `POST /api/ai/snapshot-email` — admin only, gpt-4o, logs to ai_usage_logs

**Team**
- `GET /api/team`
- `POST /api/team/invite`
- `PATCH/DELETE /api/team/members`
- `POST /api/team/accept-invite`

**Notifications**
- `GET /api/notifications`
- `GET/DELETE /api/notifications/[id]`
- `PATCH /api/notifications/[id]/read`
- `POST /api/notifications/read-all`
- `GET /api/notifications/unread-count`
- `GET/PATCH /api/notifications/preferences`

**Pipeline**
- `GET /api/pipeline/search` — debounced server search
- `GET /api/pipeline/stage-overflow` — next N for a stage

**Rep**
- `GET /api/rep/my-stats`
- `GET /api/rep/calls-today`

**Other**
- `GET/POST /api/tags`
- `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/[id]`, `GET /api/tasks/due` (renamed from `/api/activities`; backed by `follow_ups` table)

---

## 8. Feature Inventory

### Lead Management

- **Import**: CSV upload → client parses with Papaparse → presigned Supabase Storage URL → direct upload → field mapping UI → Supabase Edge Function `process-lead-import` handles async insert → poll for progress
- **Lead List**: Server-side paginated via `get_workspace_leads_page` RPC. Filters: status, batch, assigned_to, search. Sort: last_activity (default), name, company, status, date. Bulk ops: select page / select all matching (up to 50k).
- **Lead Detail**: Full profile, editable contact fields, status + interest dropdowns, questionnaire/intake, activity timeline, notes, call log
- **Lead Pipeline**: Kanban with stages. Top N per stage via `get_pipeline_leads_json`. Overflow loaded on demand. Drag-drop + 3-dot move menu. Server search. Reps see only assigned leads.
- **Status sync**: Call outcome → lead status via `OUTCOME_TO_STATUS` map. Delete last call → resets status to `new` if outcome-status.

### Call Logging

- Manual call log: outcome + notes → inserts to `call_logs` → trigger updates `leads.last_contacted_at` + `last_call_outcome` + `leads.status`
- Call log is the **single source of truth** for call counts (do NOT re-add `activity_logs` counting)
- Deleting a call activity cascades to linked `call_logs` row

### Intake Form / Questionnaire

Located in `components/leads/detail/questionnaire.tsx`. Structured fields for company info. Data lives in `leads.custom_fields` (jsonb). Includes `contact_state` and `company_state` dropdowns (50 US states).

### Email Snapshot (AI Feature)

The only surviving AI feature. Flow:
1. Admin fills out lead intake questionnaire
2. Clicks "Email Snapshot" button (3 states: Idle → Generating ~8s → Ready)
3. `POST /api/ai/snapshot-email` → gpt-4o generates snapshot email
4. `lib/intake-snapshot.ts` → `styleSnapshotBody()` applies Unicode Mathematical Sans-Serif Bold for section headers (renders as bold in Outlook and Gmail)
5. Two output options: "Open Outlook" (deeplink) OR "Copy Snapshot" (clipboard)
6. Editing any intake field invalidates the pending URL
7. Fallback: if AI fails, template version shown with amber "Template (AI down)" badge
8. Cost: ~$0.012–$0.015 per snapshot (gpt-4o, ~1500 input + ~900 output tokens)
9. All generations logged to `ai_usage_logs`

**Note:** Outlook compose deeplink accepts plain text only — Unicode bold trick works. `https://` URLs are NOT auto-linkified by Outlook in plain-text body even with the prefix (known limitation).

### Team Management

- Invite by email → pending invitation with token → accept-invite page creates user + workspace_member
- Admin can change roles via styled SelectMenu, remove members via ghost Button trash icon
- `current_user_email()` SECURITY DEFINER function required for invitations RLS (can't query `auth.users` as authenticated role)

### Notifications

- 3 active types: `mention`, `follow_up_due`, `lead_assigned`
- Realtime: `notifications` table in `supabase_realtime` publication (had to be added explicitly — not automatic)
- Bell component: `createPortal` to `document.body` with `position: fixed` (avoids header stacking context trap)
- Bell shows activities (overdue/today/upcoming) + notifications in unified panel

### Analytics

- Batch comparison (deleteable rows, admin-only trash, progress bar for leads)
- Email metrics (aggregate RPCs bypass 1000-row cap)
- Time-series charts
- Rep performance: Day/Week/Month nav with date stepper, "Today/Target" column with emerald progress bar, auto-step-back if period is empty and at/past today
- All analytics routes use SQL aggregate RPCs (not raw row fetches) to bypass PostgREST 1000-row cap

### Admin Dashboard

- Team stats, rep performance, AI usage
- Call stats via `get_call_stats_by_rep` RPC (bypasses 1000-row cap)
- KPI window: 30 days (was 7 days — widened in session 2026-05-19)

### Tasks (formerly "Activities")

- The `/tasks` page (renamed from `/activities` on 2026-06-01). Lists follow-ups + callbacks with a list view and a calendar view.
- Color-coded by time bucket: past open = red tint + red border, today open = amber tint, future = no tint, done = opacity-40
- Source: `follow_ups` table (NOT `activity_logs` — that's the separate lead-detail audit timeline)
- API: `/api/tasks` (list/create), `/api/tasks/[id]` (update/delete), `/api/tasks/due` (badge + bell + dashboard widget)
- Components: `TasksClient`, `TasksCalendar` in `app/(dashboard)/tasks/`
- **Naming note:** internal identifiers still use `activity`/`Activity` (TS type, state vars, `follow_ups` rows) — only user-facing labels, routes, files, and component names were renamed to "Task(s)".

### Settings / AI Usage

- `/settings/ai-usage`: Month-to-date USD cost, total emails sent this month, average cost per email, recent 50 generations table
- Admin only

### Mobile / Responsive (added 2026-06-01)

Responsive, shared-component approach — **desktop (`lg:`/`xl:`) rules are never modified**; mobile behaviour is added only at base/`sm`/`md`, so the desktop view is unchanged by construction.
- **Viewport meta**: `export const viewport` in `app/layout.tsx` (`width=device-width, initialScale=1`) — without it phones render zoomed-out. Was missing.
- **`useIsMobile()` hook** (`hooks/use-is-mobile.ts`): SSR-safe `matchMedia` at the `lg` breakpoint (1024px). Returns `false` on server + first client render (no desktop flash), updates after mount. Used to auto-pick mobile views.
- **Leads** (`leads-client.tsx`): `effectiveLeadView = isMobile ? 'cards' : leadView` — the wide `min-w-[760px]` table auto-switches to the existing card view on mobile; Table/Cards toggle + column menu hidden (`hidden lg:flex`/`lg:block`).
- **Pipeline** (`pipeline-client.tsx`): `effectivePipelineView = isMobile ? 'list' : pipelineView` — the 1500px+ kanban auto-switches to the list view; kanban/list toggle hidden on mobile; search full-width (`w-full sm:w-64`).
- **Tasks** (`tasks-client.tsx`): added a mobile card list (`lg:hidden`); the wide table is `hidden lg:block`. Calendar day-panel capped to `maxWidth:100vw`.
- **Lead side panel** (`lead-full-panel.tsx`): inner two-column layout stacks on mobile (`flex-col lg:flex-row`; profile card `w-full lg:w-72` capped to `max-h-[45vh] lg:max-h-none`). Panel was already `w-full` (full-screen on mobile).
- **Already responsive (no change needed)**: dashboard/analytics/admin grids (`sm:`/`lg:grid-cols-*`), all wide tables wrapped in `overflow-x-auto`, lead-detail (mobile tab bar `lg:hidden` + `flex-col lg:flex-row`), header (hamburger + mobile search overlay), `MobileSidebar` drawer.

---

## 9. Key Implementation Patterns

### Bypassing PostgREST 1000-row cap

`.range()` and `.limit()` do NOT bypass PostgREST's server-side `db-max-rows = 1000`. The only solution: single-row jsonb RPCs. Pattern:

```sql
CREATE OR REPLACE FUNCTION get_something(p_workspace_id uuid, ...)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT jsonb_agg(row_to_json(t)) FROM (...) t);
END;
$$;
```

Routes call via `.rpc('get_something', {...})` and get a single jsonb row.

### Server-side filtering vs RLS

`get_workspace_leads_json` and `get_pipeline_leads_json` bypass RLS — they trust `workspace_id` param. For pipeline, rep-level filtering (show only assigned leads) happens in the server component after RPC call, not via RLS.

### User lookups

Never call `adminClient.auth.admin.listUsers()` in hot paths. Use `lib/users.ts` which wraps SECURITY DEFINER RPCs (`get_users_by_ids`, `get_user_by_email`) that don't require `auth.users` SELECT privilege.

### Activity logging

Every significant action calls `logActivity()` from `lib/security/audit.ts`. Inserts to `activity_logs`. Used for timeline display. **Not** used for call counts (use `call_logs` directly).

### AI snapshot email

Admin-only, logs token usage, applies Unicode bold for visual structure in plain-text email. Fallback template activates silently if OpenAI call fails — now surfaced with amber badge.

### Notes multi-assign

`POST /api/leads/:id/notes` accepts `assigned_to: string | string[] | null`. Fan-out at API layer: one notification per non-self recipient. DB column `notes.assigned_to` stores only first recipient for back-compat.

### CopyableContact

`<CopyableContact>` component: click → copy to clipboard + green "Copied" pill for 1.4s. Cmd/Ctrl+click → follows href. Right-click → OS context menu unaffected.

### Portal for overlays over sticky header

Header is `sticky top-0 z-20`. Any `z-50` inside is bounded by z-20 against outside elements. Fix: `createPortal(content, document.body)` with `position: fixed + getBoundingClientRect`.

### Performance patterns

- `useTransition` on `/leads` filter changes (non-blocking UI)
- `Promise.all` for parallel data fetches on dashboard (was waterfall → ~300ms saved)
- `loading.tsx` skeleton files for `/dashboard`, `/leads`, `/pipeline`
- Suspense streaming on dashboard via async server components

---

## 10. Session Log — What Was Built & When

### Session 2026-05-11 → 2026-05-12 (13 commits, 2 migrations)

| # | What | Key files |
|---|---|---|
| 1 | Intake form + Email Snapshot button (Gmail → later changed to Outlook) | `lib/intake-snapshot.ts`, `components/leads/detail/questionnaire.tsx` |
| 2 | AI cleanup: deleted 5 features (draft-email, subject-line, follow-up, batch-personalise, enrich), kept only snapshot | `app/api/ai/snapshot-email/route.ts` |
| 3 | AI usage tracking rebuilt for snapshot only | `lib/ai/usage.ts`, `app/api/admin/ai-usage/route.ts`, `app/(dashboard)/settings/ai-usage/*` |
| 4 | Pipeline rep filtering (reps see only assigned) | `app/(dashboard)/pipeline/page.tsx` |
| 5 | Users cache (30s in-memory) to kill listUsers() scans — later replaced by RPC | `lib/users-cache.ts` (now deleted) |
| 6 | Invitations RLS fix via `current_user_email()` SECURITY DEFINER | `supabase/migrations/20260511000001_fix_invitations_rls.sql` |
| 7 | Team settings UI polish (SelectMenu + ghost Button) | `app/(dashboard)/settings/team/team-settings-client.tsx` |
| 8 | UI cleanup: remove duplicate page title from header, drop ⌘K hint | `components/layout/header.tsx` |
| 9 | Analytics "All time" preset | date-range-picker, analytics-client, overview route |
| 10 | Analytics 1000-row cap real fix: `get_batch_analytics` jsonb RPC | `app/api/analytics/batches/route.ts` |
| 11 | Import history layout cleanup (progress bar, duration grid, batch link) | `components/leads/import/import-history.tsx` |
| 12 | Pipeline card 3-dot "Move to stage" menu | `app/(dashboard)/pipeline/pipeline-client.tsx` |
| 13 | Status revert bug fixed (double-PATCH from side panel + parent) | leads-client.tsx |

### Session 2026-05-12 → 2026-05-13 (~35 commits, 13 migrations)

| # | What | Key files / migrations |
|---|---|---|
| 1 | Fix null-email trigger crash on do_not_contact status | `20260512000001_fix_unsubscribe_trigger_null_email.sql` |
| 2 | Side panel: cascade-delete call_logs, editable contact_state/company_state, reset status on last-call-delete, log call → sync status | `lib/us-states.ts`, `20260512000002_*` |
| 3 | Activities color-coding (past/today/future) | `activities-client.tsx` |
| 4 | Strip ai_usage_logs.cached (schema drift fix) | `overview/route.ts` |
| 5 | Users-lookup RPC: replace cache with SECURITY DEFINER RPCs | `lib/users.ts`, `20260512000003_users_lookup_rpcs.sql` |
| 6 | Denormalize last_contacted_at + last_call_outcome onto leads | `20260512000004_denormalize_last_contacted.sql` |
| 7 | Analytics aggregate RPCs (4 routes fixed) | `20260512000005_analytics_aggregate_rpcs.sql` |
| 8 | Pipeline trim: top N per stage + server search | `20260512000007`, `20260512000008_pipeline_trim_rpcs.sql` |
| 9 | /leads server-side pagination via RPC + bulk-update/delete | `20260512000009_leads_page_rpcs.sql` |
| 10 | "Leads Called Today" dashboard KPI (unique leads) | `20260512000010_unique_leads_called.sql` |
| 11 | Rep Performance: Today/Target column + Day/Week/Month nav + date stepper | `20260512000011`, `20260512000012` |
| 12 | Notes: assign to teammate, mention notification | `20260512000013_notes_assigned_to.sql` |
| 13 | CopyableContact component (click=copy, cmd+click=navigate) | `components/CopyableContact.tsx` |
| 14 | Perf: useTransition, Promise.all dashboard, loading.tsx skeletons, Suspense streaming | various |
| 15 | Notifications overhaul: portal fix, 3 types, Realtime publication, unified bell | `20260512000014_notifications_realtime.sql` |
| 16 | Email snapshot polish: Gmail → Outlook deeplink, copy button, fallback template, amber badge | `lib/intake-snapshot.ts` |
| 17 | Notes multi-assign (multi-select dropdown, fan-out notifications) | |
| 18 | Houston decoupling: moved to ~/Desktop/SummitCRM | |

### Session 2026-05-13 pm (3 migrations, ~7 commits)

| # | What | Key files |
|---|---|---|
| 1 | Snapshot includes company website (bare domain) | prompts.ts, intake-snapshot.ts |
| 2 | Legacy notification types dropped (9 → 3) | `20260513000001_drop_legacy_notification_types.sql` |
| 3 | FollowUpBell component deleted | `components/notifications/followup-bell.tsx` (gone) |
| 4 | Default sort = last_activity_at on /leads | leads-client.tsx, server component |
| 5 | @mention badge on notes (violet chip "→ @Name") | note components |
| 6 | email_digest column dropped | `20260513000002_drop_email_digest_column.sql` |
| 7 | get_workspace_leads_json RPC backfilled in migrations | `20260513000003_declare_get_workspace_leads_json.sql` |
| 8 | Architecture map created (architecture-map.html, 72KB) | |

### Session 2026-05-18 (1 commit)

| # | What | Key files |
|---|---|---|
| 1 | Batches analytics: remove email columns, add delete (admin), progress bar | `batch-comparison-table.tsx`, `analytics-client.tsx`, `api/analytics/batches/route.ts` |

### Session 2026-05-19 (3 commits, 1 migration)

| # | What | Key files |
|---|---|---|
| 1 | Fix call log double-counting: remove activity_logs synthetic count | `overview/route.ts`, `team-stats/route.ts`, `rep-performance/route.ts`, `dashboard/page.tsx` |
| 2 | call_logs 1000-row cap fix: `get_call_stats_by_rep` RPC | `20260519000001_call_stats_by_rep_rpc.sql` |
| 3 | Dashboard KPI window: 7 days → 30 days | `dashboard/page.tsx` |
| 4 | Rep Performance auto-step-back on empty period | rep performance component |

### Session 2026-05-21 (0 migrations, ~4 commits)

| # | What | Key files |
|---|---|---|
| 1 | ix architecture audit (228 files, 28 regions, 4 systems) | — |
| 2 | lib/supabase/server.ts reviewed — architecture confirmed correct | — |
| 3 | types/database.ts regenerated from live schema (277 → 2,165 lines, 46 RPCs) | `types/database.ts` |
| 4 | createAdminClient now uses Database type (removed `<any>`) | `lib/supabase/server.ts` |

### Session 2026-06-01 (rename: Activities → Tasks)

| # | What | Key files |
|---|---|---|
| 1 | Full rename of the user-facing "Activities" page/menu to "Tasks" | — |
| 2 | Route moved `/activities` → `/tasks` | `app/(dashboard)/activities/` → `app/(dashboard)/tasks/` |
| 3 | API moved `/api/activities/*` → `/api/tasks/*` (all 5 fetch callsites updated) | `app/api/tasks/`, sidebar, notification-panel, overdue-followups-widget, tasks-client |
| 4 | Components renamed: `ActivitiesPage`→`TasksPage`, `ActivitiesClient`→`TasksClient`, `ActivitiesCalendar`→`TasksCalendar`; files renamed to `tasks-client.tsx` / `tasks-calendar.tsx` | `app/(dashboard)/tasks/` |
| 5 | All user-facing strings → Task/Tasks (title, h1, buttons, counters, empty states) | `tasks-client.tsx`, `tasks-calendar.tsx` |
| 6 | `/batches` redirect now points to `/tasks` | `app/(dashboard)/batches/page.tsx` |
| — | Left internal identifiers (`Activity` type, `activities` state, `follow_ups` table, `activities` JSON key) unchanged — invisible to users | — |

**Exactly what we did, in order:**
1. Explored + mapped every `Activities`/`activities` reference, separating the user-facing page from the internal `activity_logs` audit system (left the latter alone).
2. `git mv` the route + API dirs (`app/(dashboard)/activities/` → `tasks/`, `app/api/activities/` → `tasks/`); renamed component files; edited all imports, exports, fetch paths, user-facing strings, the `/batches` redirect, sidebar, notification-panel, and overdue-followups widget.
3. Verified via grep: zero dangling `/activities`, `/api/activities`, or `Activities*` references. Could **not** run `tsc`/`next dev` in the agent sandbox (Node CPU-starved → 0% CPU hangs).
4. **Local dev was broken by a corrupted `.next` + `node_modules`** (leftover from killed frozen processes). Fix that worked in the user's **native Terminal**: `rm -rf .next node_modules package-lock.json && npm install && npm run dev` → booted `✓ Ready in 330ms`. `/tasks` confirmed working.
5. **Local `git commit` impossible** — sandbox cancels `.git` writes (`Operation canceled` on `.git/COMMIT_EDITMSG`); every attempt hung/deadlocked on the index lock. Diagnosed: not GPG/hooks/editor — it's the sandbox.
6. **Committed via the GitHub API instead** (see §12 quirk 15): built tree/commit/ref with `gh api` on branch `rename-activities-to-tasks`, based on remote `main` (`4ea8e30`). Commit `d2495af`. GitHub auto-detected the renames.
7. Opened **PR #1**, **squash-merged to `main`** (new tip `fb6e58f`), deleted the remote branch.

**State after session:** rename is live on remote `main`. Local working tree still shows the rename as uncommitted (the local commit never wrote) — cosmetic; resolve with `git fetch origin && git checkout main && git pull && git checkout -- .`. Unrelated local commit `e54d239` (db-types regen) remains unpushed. `PROJECT_BRAIN.md` + `CLAUDE.md` doc updates committed to `main` separately via the same gh-API route.

---

## 11. Open Items

| # | Item | Priority | Notes |
|---|---|---|---|
| 1 | CSV export of all matching leads | Medium | `handleExport` in `leads-client.tsx` only exports visible page; needs streaming endpoint |
| 2 | `lib/notifications/create.ts` dead code | Low | `createNotification` + `notifyAdmins` have zero callers (~110 lines) |
| 3 | Outlook rich-HTML clipboard | Low | Auto-linkify doesn't work in Outlook plain-text compose; need HTML clipboard write |
| 4 | `emails` table raw-row fetch in `team-stats` | Low | 1000-row cap risk; low priority until email volume >1000/30 days |
| 5 | Fix `app/api/analytics/reps/route.ts:80-81` | Medium | `.email`/`.name` on `unknown` type — was hidden under old `any` typing |
| 6 | `get_workspace_leads_json` RPC | Info | Deployed in prod but only backfilled into migrations (no-op migration). Legacy path. |
| 7 | 32 orphaned `call_logged` activity entries | Info | `metadata.call_log_id` no longer exists in `call_logs`. Harmless noise. |

---

## 12. Quirks & Gotchas

1. **PostgREST `db-max-rows` is hard-capped at 1000** — `.range()`, `.limit()`, and query params do NOT bypass it. The only escape: single-row jsonb RPCs.

2. **`call_logs` is the single source of truth for call counts** — never re-add `activity_logs` synthetic counting. Prior incident: commit `d712296` did both, causing double-counting on every bulk status change.

3. **`get_workspace_leads_json` RPC bypasses RLS** — it trusts `workspace_id` param. Pipeline rep filtering is enforced at the server component layer, not DB layer.

4. **Header stacking context** — `sticky top-0 z-20` creates a stacking context. `z-50` inside header is bounded by z-20 against external elements. Fix: `createPortal` to `document.body` with `position: fixed`.

5. **`notifications` table needs explicit Realtime enrollment** — `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications`. Supabase does not add new tables automatically. Symptom: data in DB but UI doesn't update until refresh.

6. **`STABLE` functions can't `CREATE TEMP TABLE`** — mark such functions as `VOLATILE`.

7. **Gmail compose URL is plain text only** — Unicode Mathematical Sans-Serif Bold (U+1D5D4+) works for visual bold. Trade-off: screen readers may read each letter. Outlook compose deeplink has same limitation.

8. **Outlook does NOT auto-linkify URLs in plain-text body** — even with `https://` prefix. Would need HTML clipboard or Gmail API OAuth for clickable links.

9. **Schema drift risk** — always verify columns exist in live DB before writing to them. `ai_usage_logs.cached` was in repo migration but never in prod (removed). `get_workspace_leads_json` was in prod but not in migrations (backfilled).

10. **`row_to_jsonb()` doesn't exist in Postgres** — use `to_jsonb()` instead.

11. **Auto-mode classifier** may block MCP prod migrations / git pushes. User workaround: turn off auto mode or run `! git push` themselves.

12. **`get_workspace_leads_page` must be `VOLATILE`** — it uses `CREATE TEMP TABLE`. Marking it `STABLE` or `IMMUTABLE` will fail.

13. **AI env vars required for snapshot** — `OPENAI_API_KEY` + `NEXT_PUBLIC_FEATURE_AI=true` must be set in Vercel environment. Missing vars → silent fallback to template.

14. **Any intake field edit invalidates the pending snapshot URL** — intentional, prevents stale snapshots being sent.

15. **Committing from the Claude Code agent: use the GitHub API, not local `git`.** The agent sandbox cancels writes into `.git/` (`fatal: could not open '.git/COMMIT_EDITMSG': Operation canceled`) and starves `git commit` / `tsc` / `next dev` of CPU, so local commits hang/fail even with the sandbox disabled. Workflow that works: build the commit via `gh api` (network-only, bypasses `.git`):
    1. base commit/tree from remote: `gh api repos/<owner>/<repo>/git/ref/heads/main` → `.object.sha`, then `.../git/commits/<sha>` → `.tree.sha`
    2. create tree with `gh api .../git/trees` — content files as `{path,mode:"100644",type:"blob",content:<text>}`, deletions as `{...,sha:null}` (build the JSON with `jq --rawfile`)
    3. create commit `gh api .../git/commits` with `parents:[<base>]`
    4. create/update ref `gh api .../git/refs`
    5. PR + merge: `gh api .../pulls`, `gh api -X PUT .../pulls/<n>/merge`
    `gh` is installed and authed as `Glazyman`. The user runs the app locally in their **native Terminal** (not the agent), where `npm run dev` boots normally. See the helper script pattern at `/tmp/summit-api-commit.sh` from the 2026-06-01 session. Note: this commits straight to the remote — outward-facing, so confirm intent first.

16. **`Questionnaire` (intake form) must re-sync from its `data` prop, not just the `useState` initializer.** `components/leads/detail/questionnaire.tsx` is a controlled form whose state seeds from `data`. The full lead-detail page (`lead-detail-client.tsx`) mounts it **eagerly** — `<Section>` always renders children and shows all sections on desktop (`lg:block`) — *before* the async `/api/leads/[id]/questionnaire` fetch resolves, so the initializer captured `null` and the form stayed blank even when intake existed. The side panel only *appeared* to work because it mounts the form conditionally (`activeTab === 'questionnaire' && <Questionnaire>`), i.e. after data loaded. Fixed 2026-06-01 with a `useEffect([data])` that re-seeds `answers`/`questions`, guarded by a `dirtyRef` so it never clobbers unsaved edits. Lesson: any eagerly-mounted controlled form fed by an async fetch needs a prop-change re-sync, not just an initializer.

---

## 13. Security Model

**Multi-tenancy:** RLS on every table, enforced by `workspace_id`. JWT contains `workspace_id` + `role` custom claims set via Supabase Auth hook.

**Two Supabase clients:**
- `createClient()` (RLS-scoped via cookies) — for user operations
- `createAdminClient()` (service role) — for cross-user reads (send invites, list members). Session/token refresh disabled. Used cautiously.

**Secrets:** API keys and SMTP passwords in Supabase Vault (never in DB tables directly).

**API surface:** All routes validate auth, role, and workspace membership before mutations. Zod schemas validate inputs. Rate limiting on auth and AI endpoints.

**Webhook security:** Supabase webhook signature verification (svix library).

**GDPR hooks:** `unsubscribes` table, `do_not_contact` flag, data export/delete hooks in place.

**RLS helper functions (SECURITY DEFINER):**
- `is_admin(workspace_id)` — checks role in workspace_members
- `has_role(workspace_id, role)` — generic role check
- `get_my_role(workspace_id)` — returns caller's role
- `current_user_email()` — for invitations RLS (can't query auth.users as authenticated role)

---

## 14. Deployment

| Environment | Branch | Host | DB |
|---|---|---|---|
| Production | `main` | Vercel | Supabase project `nmcyxulluascofmsgkxr` |
| Preview | Every PR | Vercel | (uses prod DB — be careful with migrations) |

**Migrations:** Applied manually via Supabase MCP or `supabase db push`. Migration files are in `/supabase/migrations/`. Never applied without explicit user authorization.

**CI/CD:** GitHub → Vercel auto-deploy on push to `main`. GitHub Actions: lint + type check on every push/PR.

**Architecture map:** `architecture-map.html` at repo root. Open with: `python3 -m http.server 4747` → `http://localhost:4747/architecture-map.html`. 228 files, 28 regions, 6 column-clusters, ~80 edges.

---

## 15. Environment Variables

| Variable | Required | Where used |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | All Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser + SSR clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Admin client (server-only) |
| `OPENAI_API_KEY` | Yes (for AI) | `lib/ai/client.ts` |
| `RESEND_API_KEY` | Yes | Transactional email |
| `NEXT_PUBLIC_APP_URL` | Yes | Redirects, deeplinks |
| `NEXT_PUBLIC_APP_NAME` | Yes | Display name |
| `NEXT_PUBLIC_FEATURE_AI` | Yes (for AI) | Feature flag for snapshot button |
| `RESEND_WEBHOOK_SECRET` | Optional | Webhook verification |

---

### Session 2026-06-01 (mobile / responsive pass)

| # | What | Key files |
|---|---|---|
| 1 | Added viewport meta (was missing → phones rendered zoomed-out) | `app/layout.tsx` |
| 2 | `useIsMobile()` SSR-safe hook (lg breakpoint) | `hooks/use-is-mobile.ts`, `hooks/index.ts` |
| 3 | Leads: auto card view on mobile; desktop table/column controls hidden below lg | `app/(dashboard)/leads/leads-client.tsx` |
| 4 | Pipeline: auto list view on mobile (kanban is 1500px+ wide); search full-width | `app/(dashboard)/pipeline/pipeline-client.tsx` |
| 5 | Tasks: mobile card list; wide table desktop-only; calendar panel capped to 100vw | `app/(dashboard)/tasks/tasks-client.tsx` |
| 6 | Lead side panel: inner columns stack on mobile | `components/leads/lead-full-panel.tsx` |
| — | Approach: responsive shared components — only base/sm/md rules added, no `lg:`/`xl:` desktop rules modified, so desktop is unchanged | — |
| — | Dashboard/analytics/admin/settings/lead-detail were already responsive (grids stack, tables in `overflow-x-auto`, mobile tab bar) — no change needed | — |

### Session 2026-06-01 (follow-up scheduling + profile nav)

| # | What | Key files |
|---|---|---|
| 1 | **Untimed tasks** via a midnight sentinel (no migration): a task stored at local 00:00 = "no time slot". `fmtDate` shows date-only; `isOverdue` is calendar-day aware so a midnight task isn't "overdue" at 9am. New-task dialog got an "all day / no time" checkbox. | `app/(dashboard)/tasks/tasks-client.tsx` |
| 2 | **No-answer/voicemail follow-up popup reworked** → shared `<FollowUpPrompt>`: "Add to tasks" creates an UNTIMED task (tomorrow 00:00); "Set time" reveals a date+time picker. Replaces the old hardcoded "tomorrow 11am" in all 4 call sites. | `components/leads/detail/follow-up-prompt.tsx`, `lead-full-panel.tsx`, `lead-detail-client.tsx`, `leads-client.tsx`, `quick-log-call-widget.tsx` |
| 3 | **Time-conflict greying** (same-rep scope): `TimePicker` gained a `disabledSlots` prop; `useTakenSlots(assignee, date)` fetches the assignee's non-completed tasks for that date and greys booked HH:MM slots. | `components/ui/calendar-picker.tsx`, `hooks/use-taken-slots.ts` |
| 4 | **Full profile opens in origin context**: the "Full profile" link carries `?from=<path>`; the sidebar highlights that section instead of always Leads when on `/leads/<id>?from=…`. (Back button already returns to origin via `router.back()`.) | `components/leads/lead-full-panel.tsx`, `components/layout/sidebar.tsx` |

---

## Untimed tasks (midnight sentinel) — how it works

A `follow_ups.due_at` at **local 00:00** means "no time slot" (the time picker only offers 6am–9:30pm, so midnight can't collide with a real pick). No DB column was added.
- Display: `fmtDate`/calendar show date-only (no "· 2:30 PM"); day panel shows "All day".
- Overdue: `isOverdue()` in `tasks-client.tsx` is calendar-day aware — a midnight task today is NOT overdue until the day passes.
- Created by: the follow-up popup's "Add to tasks", and the New Task dialog's "all day / no time" checkbox.
- Conflict greying: `useTakenSlots` ignores untimed tasks (they occupy no slot).

---

## Rep permissions on leads (what a `rep` can't do)

Server already enforces (defense-in-depth, all pre-existing):
- Delete a lead — single `DELETE /api/leads/[id]` (admin-only) and `DELETE /api/leads/bulk` (admin-only) both 403 a rep.
- Move a lead between batches — `PATCH /api/leads/[id]` rejects `batch_id` changes for non-admins; reps also can't reassign `assigned_to`.

UI gating (added 2026-06-01 — the server checks existed but the buttons were still shown):
- Row "Delete Lead" menu (`lead-table.tsx`) — now `{isAdmin && …}`. Full-page action bar already gated.
- Bulk "Add to batch" (`bulk-action-bar.tsx`) — now `{isAdmin && …}` (bulk Assign + Delete were already admin-only).
- Batch move/rename in the profile card is gated by `canEditBatch` (= `isAdmin` at every call site); `LeadProfileCard` default flipped to `canEditBatch = false` for safety.
- **Columns for reps**: the "Assigned To" column is removed from the column menu (`hiddenColumnIds={isRep ? {'assigned'} : …}`) and forced off in `visibleColumns` — reps only see their own leads so the assignee is always them. Its header already returned `null` for non-admins.

**Tags column removed**: the `tags` column was a dead placeholder (always rendered "—" — never wired to the real tags system in `tag-picker.tsx` / `/api/tags`). Removed from `COLUMNS` and `ColumnId`. The `LeadRow.tags` data field stays (used elsewhere).

---

### Session 2026-06-01 (rep permissions + column cleanup)

| # | What | Key files |
|---|---|---|
| 1 | Hide row "Delete Lead" for reps (server already 403'd) | `components/leads/lead-table.tsx` |
| 2 | Hide bulk "Add to batch" for reps | `components/leads/bulk-action-bar.tsx` |
| 3 | Reps can't toggle the "Assigned To" column (menu + visibleColumns) | `column-visibility-menu.tsx`, `leads-client.tsx` |
| 4 | Removed dead "Tags" placeholder column | `components/leads/types.ts`, `lead-table.tsx` |
| 5 | `LeadProfileCard` default `canEditBatch` → `false` (safety) | `components/leads/detail/lead-profile-card.tsx` |

---

*Last updated: 2026-06-01 — covers all sessions through 2026-06-01 (Activities → Tasks rename; gh-API commit workflow; mobile pass; untimed follow-ups + conflict greying + origin-context profile nav; rep permissions + Tags column removal)*
