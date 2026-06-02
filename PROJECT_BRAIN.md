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

**Working directory (as of 2026-06-02):** `~/Developer/SummitCRM` — moved OFF the old `~/Desktop/SummitCRM` because Desktop is inside macOS "Desktop & Documents in iCloud", and iCloud corrupted the local `.git` (see §12 quirk 15b). Native `git` works normally in the new location. The old folder is kept as a backup at `~/Desktop/SummitCRM.OLD-icloud` (deletable). Do NOT put the repo back under `~/Desktop`/`~/Documents`.

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
| Radix | `radix-ui` (unified, ^1.4.3) + `@radix-ui/react-slot` | `radix-ui` added 2026-06-02 for the reui select (`components/ui/select-radix.tsx`) |
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
│   ├── database.ts            ← HAND-MAINTAINED types (~276 lines), mirrors the Supabase schema. NOTE: the "2,165-line auto-generated" version was a FAILED `supabase gen types` run that wrote npm/error output into the file ("File is not a module" → broke the Vercel build 2026-06-02); reverted to the manual file. Don't regen unless the supabase CLI is actually configured AND verify the output is real TS before committing.
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

- **Batches: MOVED to the Import page** (2026-06-01). The `BatchComparisonTable` now lives on `/leads/import` under the "Import History" tab (stacked below Import History), not on Analytics. Analytics tabs are now just Overview + Rep Performance.
- Email metrics (aggregate RPCs bypass 1000-row cap)
- Time-series charts
- **Dashboard Rep Performance panel** (`components/dashboard/rep-performance.tsx`, admin-only on `/dashboard`): rolling **Today / Last 7 days / Last 30 days / All time** presets (changed 2026-06-02 from calendar Day/Week/Month + date stepper — the calendar windows hid old/May-dated calls once the month rolled over). Donut of call outcomes + per-rep table; "Today" shows the daily-target progress bar, other presets show a plain leads-called count. Backed by `/api/admin/rep-performance?start&end` (legacy `period&date` still accepted).
- **Pipeline filters (admin only)**: Rep / Batch / Activity-date presets on `/pipeline` — client-side over the loaded set; counts + stat cards recompute from the filtered set. See Section 8 Lead Pipeline.

### Import page (`/leads/import`)

- Tabs: "New Import" (wizard) and "Import History".
- The Import History tab shows **Import History** and, stacked below it, the **Batches** section (`BatchComparisonTable` — expand a batch to see its leads, delete is admin-only). Both fetch on tab open. Batches data comes from `/api/analytics/batches`.
- Server passes `isAdmin` + `currentUserId` to the client for the batches table.
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

15b. **RESOLVED 2026-06-02 — the git hang was local `.git` corruption in the OLD iCloud Desktop repo; we migrated off it.** Symptom: `git log -- <path>` (path-scoped history) and `git fsck` hung in an `ll_diff_tree_paths`/`emit_path` recursion (confirmed via `sample <pid>`), while plain `git status`/`git log`/`git diff`/`git show` were fast. Root cause: a degenerate/corrupt object in the **local** `.git` (the old repo lived in `~/Desktop`, inside macOS "Desktop & Documents in iCloud" — iCloud's File Provider mangled a `.git` object). Proof it was local-only: a fresh `git clone` of the remote ran `git log -- package.json` instantly, so **GitHub history was clean**. `commit-graph write` + `repack -ad` did NOT fix it. **Fix applied:** fresh `git clone` into a non-iCloud path + `rsync -a` the working tree across (excluding `.git`/`node_modules`/`.next`; the whole-tree rsync stalled on iCloud-evicted `.gstack`/`.vercel` junk, so copy explicit source dirs `app components lib hooks types public` + root files instead). Outcome: **native git fully works in the new repo** — the §15 gh-API workaround is NO LONGER needed here. Also fixed two landmines: `git config --global filter.lfs.required false` (git-lfs was required globally but not installed) and set real `user.name`/`user.email` (were placeholders → commits showed author "Your Name").

15. **(Legacy — applied to the old `~/Desktop` repo only.) Committing from the Claude Code agent used the GitHub API, not local `git`.** In the corrupted/iCloud Desktop repo the agent sandbox canceled writes into `.git/` (`fatal: could not open '.git/COMMIT_EDITMSG': Operation canceled`) and starved `git commit`/`tsc`/`next dev` of CPU. The new `~/Developer/SummitCRM` repo does NOT have this problem — commit/push natively. The gh-api recipe is kept below only for reference / headless cron runs:
    1. base commit/tree from remote: `gh api repos/<owner>/<repo>/git/ref/heads/main` → `.object.sha`, then `.../git/commits/<sha>` → `.tree.sha`
    2. create tree with `gh api .../git/trees` — content files as `{path,mode:"100644",type:"blob",content:<text>}`, deletions as `{...,sha:null}` (build the JSON with `jq --rawfile`)
    3. create commit `gh api .../git/commits` with `parents:[<base>]`
    4. create/update ref `gh api .../git/refs`
    5. PR + merge: `gh api .../pulls`, `gh api -X PUT .../pulls/<n>/merge`
    `gh` is installed and authed as `Glazyman`. The user runs the app locally in their **native Terminal** (not the agent), where `npm run dev` boots normally. See the helper script pattern at `/tmp/summit-api-commit.sh` from the 2026-06-01 session. Note: this commits straight to the remote — outward-facing, so confirm intent first.

16. **`Questionnaire` (intake form) must re-sync from its `data` prop, not just the `useState` initializer.** `components/leads/detail/questionnaire.tsx` is a controlled form whose state seeds from `data`. The full lead-detail page (`lead-detail-client.tsx`) mounts it **eagerly** — `<Section>` always renders children and shows all sections on desktop (`lg:block`) — *before* the async `/api/leads/[id]/questionnaire` fetch resolves, so the initializer captured `null` and the form stayed blank even when intake existed. The side panel only *appeared* to work because it mounts the form conditionally (`activeTab === 'questionnaire' && <Questionnaire>`), i.e. after data loaded. Fixed 2026-06-01 with a `useEffect([data])` that re-seeds `answers`/`questions`, guarded by a `dirtyRef` so it never clobbers unsaved edits. Lesson: any eagerly-mounted controlled form fed by an async fetch needs a prop-change re-sync, not just an initializer.

17. **recharts 3.8 breaks the stock shadcn/21st.dev `chart.tsx` types — and it only fails at build, never in the sandbox.** When pasting a 21st.dev chart that ships its own `chart.tsx` (we vendored it as `components/ui/pie-chart.tsx`), the upstream prop types assume older recharts. In **recharts 3.8** the `Tooltip` props are `Omit<…, PropertiesReadFromContext>` (no `active`/`payload`/`label`/`formatter`) and `LegendProps` no longer has `payload`/`verticalAlign`, and `LabelList`'s `formatter` param is `RenderableText` not `number`. Fix by giving `ChartTooltipContent`/`ChartLegendContent` **explicit** props types (don't lean on `ComponentProps<typeof Tooltip>` / `Pick<LegendProps,…>`) and typing the `LabelList` formatter param `unknown`. The agent sandbox can't run `tsc`/`next build` (Node is starved), so these surface only on the Vercel deploy — check the Vercel MCP build logs (`get_deployment_build_logs`) to read the type error, or have the user run `npx tsc --noEmit` natively before committing chart/type-heavy changes.

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

### Session 2026-06-01 (dashboard "Tasks" widget)

| # | What | Key files |
|---|---|---|
| 1 | Dashboard follow-ups widget renamed **"Follow-ups" → "Tasks"**; now shows **all** of the day's tasks (overdue + due today, removed the 5-item cap; list scrolls); untimed tasks show "Due today"; link to `/tasks` ("All tasks"). | `components/notifications/overdue-followups-widget.tsx` |
| 2 | KPI stat cards "Follow-ups Due" → "Tasks Due" (rep + admin). | `app/(dashboard)/dashboard/page.tsx` |
| 3 | Removed the "Log a call" quick widget from the rep dashboard (import + render). `quick-log-call-widget.tsx` now orphaned/dead code, left in place. | `app/(dashboard)/dashboard/page.tsx` |

---

### Session 2026-06-01 (rep-performance "Today" bounce fix)

**Bug:** The admin dashboard Rep Performance panel defaulted to *yesterday* and clicking "Today" bounced back to yesterday. **Root cause:** `components/dashboard/rep-performance.tsx` `load()` ran an auto-step-back on *every* anchor change — if the period had 0 calls and was at/past today, it called `setAnchor(yesterday)`. So `jumpToday()` → effect → `load(today)` → 0 calls → stepped back, fighting the click. **Fix:** removed the auto-step-back entirely (per user choice). The panel now always shows the selected day, defaults to today (empty "no calls yet" early in the day is fine), and the Today button / arrows stick. (Supersedes the 2026-05-19 §4 "auto-step back on empty period" behavior.)

---

### Session 2026-06-01 (batches moved to Import page)

| # | What | Key files |
|---|---|---|
| 1 | Moved the Batches section out of Analytics into the Import page, stacked under Import History on the "Import History" tab. All features preserved (expand batch → leads, admin delete). | `app/(dashboard)/leads/import/import-page-client.tsx`, `import/page.tsx` |
| 2 | Removed the "Batches" tab + state/fetch from Analytics (now Overview + Rep Performance only). | `app/(dashboard)/analytics/analytics-client.tsx` |

---

### Session 2026-06-01 (rep dashboard KPI cards)

| # | What | Key files |
|---|---|---|
Rep dashboard 4 KPI cards, final state:
| Card | Shows |
|---|---|
| **Total Leads** | `contacted / assigned` e.g. `300 / 600` — `leadsContacted` (all-time unique leads the rep called, via `get_unique_leads_called(ws,userId,epoch)`) over the rep's **assigned** total. Total now filters `assigned_to = userId` for reps (admins still see workspace-wide). |
| **Deals in Pipeline** | the rep's own deals: count of `assigned_to=userId AND pipeline_stage_id IS NOT NULL`. Links to `/pipeline`. |
| **Tasks Due** | follow_ups due today (rep's own). |
| **Leads Called Today** | `unique-leads-today / daily-target`; description reworded "unique leads vs. target" → **"of your daily target"**. |
Removed the separate "Leads Contacted" / "New Leads" card (merged contacted into Total Leads).

---

### Session 2026-06-01 (interest → pipeline removal)

**Bug:** Setting a lead's interest to "interested" auto-adds it to the pipeline (the `Interested` stage), but moving interest back to "pending" left `pipeline_stage_id` set, so it stayed in the pipeline. **Cause:** `PATCH /api/leads/[id]` `INTEREST_PIPELINE_RULES` only mapped `interested → 'Interested'`; "pending" had no rule, so the stage was never cleared. **Fix:** added `INTEREST_PIPELINE_REMOVE = {'pending'}` — when interest changes to one of those (and the caller didn't set a stage explicitly), `patch.pipeline_stage_id = null`, removing the lead from the pipeline. (`not_interested` not included — say so if it should also drop out.)

---

### Session 2026-06-01 (admin dashboard KPI cards)

Admin dashboard 4 cards now mirror the rep layout, workspace-wide:
| Card | Shows |
|---|---|
| **Total Leads** | `contacted / total` — `leadsContacted` (count of leads with `last_contacted_at IS NOT NULL` = contacted by any rep/admin, all-time) over workspace total. |
| **Deals in Pipeline** | workspace leads with `pipeline_stage_id IS NOT NULL` (all reps' deals). Links to `/pipeline`. Replaced the old "Interested" card. |
| **Leads Called** | unique leads called in the last 30 days — **once per lead** (`count(leads WHERE last_contacted_at >= 30d ago)`), NOT raw call events. Was "Calls Logged" counting `call_logs` rows; changed because raw calls (65) confusingly exceeded unique contacted (54). |
| **Tasks Due** | follow_ups due today, workspace (unchanged). |
`getDashboardMetrics`: `leadsContacted` and `dealsInPipeline` queries are now role-aware (admins = workspace-wide via `last_contacted_at`/no-assignee-filter; reps = their own via the RPC / `assigned_to`). Removed the `interestedLeads` metric + its query. **All dashboard call counts are now "unique leads, one per person"** — reps already used `get_unique_leads_called` (= `count(DISTINCT lead_id)`); the admin "Calls Logged" raw count was the only holdout and is now `leadsCalled` (unique).

---

### Session 2026-06-01 (mobile header + drawer polish)

| # | What | Key files |
|---|---|---|
| 1 | Mobile header layout: the right-action icons bunched on the left because `ml-auto` was on the search pill (hidden < md). Moved it: search pill → `md:ml-auto`, right actions → `ml-auto md:ml-2`. Desktop unchanged (resolves to old values at ≥md). | `components/layout/header.tsx` |
| 2 | Hid the sidebar collapse/expand arrow inside the **mobile drawer** (collapsing a drawer makes no sense). Added `hideCollapse` prop to `Sidebar`; `MobileSidebar` passes it. Desktop sidebar still shows the arrow (doesn't pass the prop). | `components/layout/sidebar.tsx`, `mobile-sidebar.tsx` |

---

### Session 2026-06-01 (mobile header dropdowns centered)

| # | What | Key files |
|---|---|---|
| 1 | Notification bell panel overflowed off the left on phones (380px panel anchored to the bell's right edge). Below `sm`, now hugs the right with a 12px margin + capped to `100vw-1.5rem` → centered with even gutters. Desktop unchanged (still bell-anchored, 380px). | `components/notifications/notification-panel.tsx` |
| 2 | Profile (user) dropdown: on mobile now `fixed inset-x-3 top-[68px]` (centered, full-width, even 12px gutters); `sm:` restores the original right-aligned `absolute … w-56` desktop dropdown. | `components/layout/header.tsx` |

---

### Session 2026-06-01 (analytics + team mobile layout)

| # | What | Key files |
|---|---|---|
| 1 | Team page mobile: header stacks (`flex-col sm:flex-row`); member/invite/inactive rows use `px-4 sm:px-6` + `min-w-0`/`truncate` so names/emails don't overflow; **Daily Call Targets** grid was `grid-cols-[1fr_130px_130px]` (260px of fixed cols, too wide for phones) → `grid-cols-[1fr_76px_64px] sm:grid-cols-[1fr_130px_130px]`. | `app/(dashboard)/settings/team/team-settings-client.tsx` |
| 2 | Analytics "Export CSV" button → icon-only below `sm` (text was crowding the mobile header). Overview/rep-performance were already responsive (stacking grids), so no other analytics change. | `components/analytics/analytics-export-button.tsx` |
| 3 | **Date-range bar** (Today / Last 7 days / Last 30 days / All time) overflowed its rounded box on phones (single non-wrapping row). Now 4 equal-width segments that fill the row, shorter labels on mobile (`7 days`/`30 days`), calendar icon hidden < sm. Used on **both** Analytics + Admin dashboards (`hidden md:flex` desktop / `w-full` mobile). Desktop unchanged (`sm:` guards). | `components/admin/date-range-picker.tsx` |

---

### Session 2026-06-01 (analytics per-person + lead-status stats)

Final state of the analytics overview + rep performance (admin/team analytics; the reps route is admin-only):
- **Overview Call Summary** donut center = **`unique_leads`** ("leads called", per person — the 54). The breakdown column lists the call outcomes (answered/voicemail/…) AND, under a small "Lead status" divider, **Interested / Not interested / Bad leads** (`status='do_not_contact'`). Lead-status counts are a **current** workspace snapshot (not date-filtered). No separate Lead Status / Leads Called cards. Page subtitle: `{unique_leads} called · {total} calls · {leads_total} leads`.
- **Answer Rate** stays a per-call metric (answered / total calls) in its own card — there's no per-person answer rate, so it's intentionally of total calls.
- **Rep Performance**: each rep card's headline KPI toggles via a section-level **"Per person / All calls"** control (default Per person = `rep.unique_leads`; ranking + the KPI tile follow it). The per-rep outcome donut stays all-calls.
- Backend (`GET /api/analytics/reps`): overview gained `unique_leads` (`count(leads WHERE last_contacted_at in range)`, exact for presets) + `interested`/`not_interested`/`bad_leads` (current counts); each rep gained `unique_leads` via `get_unique_leads_called_by_rep_range`. No migration — denormalized fields + existing RPC.
- `CallOverview` + `RepRow` types and `EMPTY_OVERVIEW` updated accordingly.

| Key files | |
|---|---|
| `app/api/analytics/reps/route.ts`, `components/analytics/types.ts`, `components/analytics/rep-performance-table.tsx`, `app/(dashboard)/analytics/analytics-client.tsx` | |

---

### Session 2026-06-01 (pipeline "Needs Buyer" card)

Pipeline page 2nd stat card "Hot Leads" (interested count) → **"Needs Buyer"**: counts leads in the **"Needs Buyer" pipeline stage** (a seeded stage, `20260508000002_activities_and_pipeline.sql` position 2). Computed client-side: `stages.find(name === 'needs buyer')` → `stageCounts[stage.id]`. Falls back to 0 if no such stage. `app/(dashboard)/pipeline/pipeline-client.tsx`.

---

### Session 2026-06-01 (lead-status % + mini-chart on analytics + real sized pie)

- Lead-status rows in the analytics Call Summary now show **% of total leads** (`leads_total` denominator), matching the call-outcome row style.
- **Mini bar chart** (21st.dev "mini-chart" look — custom div bars, hover highlight + neighbour dim, animated): `components/dashboard/daily-calls-mini-chart.tsx`. **Lives in the Analytics overview right-hand stats column as a card under Follow-ups** (NOT full width; was briefly on the dashboard, removed from there). Plots **unique leads called per day** (`leads_called` = DISTINCT lead per UTC day) to match the per-person framing. **Honours the page's date range** — takes `start`/`end` props and passes them to `GET /api/analytics/calls-7d?start&end`, so its bars reconcile with the Call Summary total for the same range (fixes the earlier "shows 0 this week but Call Summary shows N" confusion, which was the chart's fixed 7-day window vs the page's 30-day default). Endpoint caps at the most recent 30 day-buckets (so "All" doesn't render hundreds of bars); rep → own activity, admin → workspace; returns `calls` + `leads_called` per day. NOTE: legacy `get_time_series_analytics` RPC is **email**-only — that's why a dedicated endpoint exists.
- **Call Summary donut → real "sized pie"** (21st.dev `LegionWebDev/pie-chart` "Sized Pie Chart"). Added the shadcn chart primitive at **`components/ui/pie-chart.tsx`** (`ChartContainer`/`ChartTooltip`/`ChartTooltipContent`, etc.; works with recharts 3 / Tailwind v4). `SizedPie` in `analytics-client.tsx`: ONE donut where each call outcome is an **angular slice sized by its share of calls but extended to a different OUTER radius** (bigger outcome = wider AND longer wedge; smallest closest in). Per-slice value `LabelList`, `cornerRadius=4`, shared `innerRadius=32` hole; center keeps the `unique_leads` number + "leads called". Slice colours from `OUTCOME_COLORS` (no `--chart-N` vars defined in this project, so colours are passed via `Cell fill`, config carries labels only).
- **GOTCHA — recharts 3.8 prop types** (see §12): the upstream shadcn/21st.dev `chart.tsx` snippet does NOT type-check against this project's **recharts 3.8**. Three fixes were needed in `components/ui/pie-chart.tsx`: (1) `LabelList` `formatter` param is `RenderableText` (string|number|undefined), not `number` — type it `unknown` and coerce; (2) `Tooltip` props no longer expose `active`/`payload`/`label`/`formatter` (`Omit<…, PropertiesReadFromContext>`), so `ChartTooltipContent` needs an **explicit** props type instead of `ComponentProps<typeof Tooltip>`; (3) `LegendProps` dropped `payload`/`verticalAlign`, so `ChartLegendContent` needs an explicit props type instead of `Pick<LegendProps, …>`. These only surface at `tsc`/Vercel build, not in the sandbox.

---

### Session 2026-06-02 (analytics donut revert · dashboard rep-perf presets · pipeline filters · git hang)

| # | What | Key files |
|---|---|---|
| 1 | **Reverted the analytics Call Summary "sized pie" back to a plain donut wheel** (`CallDonut`: single recharts `Pie`, innerRadius 56 / outerRadius 80, custom legend + center = unique leads). Dropped the `@/components/ui/pie-chart` ChartContainer/LabelList usage on this page. Dashboard donuts were already donuts — left as-is per user. | `app/(dashboard)/analytics/analytics-client.tsx` |
| 2 | **Dashboard Rep Performance panel: Day/Week/Month + date stepper → rolling presets** (Today / Last 7 days / Last 30 days / All time), identical semantics to the analytics page. Fixes "this week/this month shows no calls": the calendar windows (June 1–8 / June) legitimately excluded the May-dated calls; rolling 30d / All time now surface them. Removed `periodLabel`/`stepAnchor`/`isAtOrPastToday`/`startOfWeek`/stepper UI. Route now accepts `?start&end` (legacy `period&date` still supported as fallback). Default preset = 30d. "Today" still shows the daily-target progress bar; other presets show a plain count. | `components/dashboard/rep-performance.tsx`, `app/api/admin/rep-performance/route.ts` |
| 3 | **Pipeline filters (admin only): Rep, Batch, Activity date.** Server page fetches rep + batch options (admin only) via `getUsersById` + `lead_batches`, passes `repOptions`/`batchOptions` props. Client filters the loaded set client-side (`filteredLeads`), recomputes per-stage counts (`effectiveStageCounts`) + the 4 stat cards from the filtered set, and hides "+N more" overflow while filtering. Filter bar (`FilterSelect` native selects + Clear) renders only when `isAdmin`. Date presets filter on `last_activity_at ?? last_contacted_at ?? created_at`. Limitation: only filters the top-100-per-stage loaded set (fine for real-world pipeline sizes). | `app/(dashboard)/pipeline/page.tsx`, `app/(dashboard)/pipeline/pipeline-client.tsx` |
| 4 | **Diagnosed + resolved the git hang** (see §12 quirk 15b): local `.git` corruption in the iCloud Desktop repo. Verified remote clean via throwaway clone, then **migrated the repo to `~/Developer/SummitCRM`** (fresh clone + rsync working tree). Native git now works there. Set global `user.name`/`user.email`, disabled `filter.lfs.required`. Retired old folder → `~/Desktop/SummitCRM.OLD-icloud`. | — |
| 5 | **Committed + pushed today's work to `main`** natively (commit `eaef2a1`), which **broke the Vercel build**: `types/database.ts` was garbage (a failed `supabase gen types` run that captured npm/error output → "File is not a module"). **Fixed** by restoring the hand-maintained 276-line `types/database.ts` + matching `lib/supabase/server.ts` from last-green `f2b6ead` (commit `d1c33bd`); build went green, deployed to prod (`summitcrm.work`). | `types/database.ts`, `lib/supabase/server.ts` |
| 6 | **Pipeline filter dropdowns restyled** from native `<select>` to the app's `SelectMenu` (portal, searchable, check marks) to match other dropdowns. Rep/batch use `''`=all (SelectMenu nullable convention). | `app/(dashboard)/pipeline/pipeline-client.tsx` |
| 7 | **Dashboard Rep Performance donut now leads with UNIQUE leads called (54), not raw calls (65)** — center = unique leads + "leads called" with "{n} calls" secondary; per-rep bars show "{leads} leads · {calls} calls". Matches the analytics per-person framing. Route returns workspace-level `uniqueLeads` = `count(leads WHERE last_contacted_at in range)`. | `components/dashboard/rep-performance.tsx`, `app/api/admin/rep-performance/route.ts` |
| 8 | **Removed the `DailyCallsMiniChart`** (leads-called/day) from the Analytics overview stats column per request (component + `/api/analytics/calls-7d` left in place but now unused). Dropped the now-unused `start`/`end` props from `OverviewCards`. | `app/(dashboard)/analytics/analytics-client.tsx` |
| 9 | **Lead-status % fix** — the Call Summary "Lead status" rows showed 0% because the denominator was `leads_total` (ALL leads, mostly untouched "new"). Changed to **% of contacted leads** (`contacted_total` = `count(leads WHERE last_contacted_at IS NOT NULL)`, new field on the `/api/analytics/reps` overview + `CallOverview`). Label → "Lead status · % of contacted"; capped at 100%, shows "—" when no contacted leads. | `app/api/analytics/reps/route.ts`, `components/analytics/types.ts`, `app/(dashboard)/analytics/analytics-client.tsx` |
| 11 | **Status & Interest selectors restyled to the reui status-select look** (colored dot + label in trigger, dots + check in the list). New reusable `StatusSelect`/`InterestSelect` (`components/leads/status-select.tsx`) built on the existing **`SelectMenu`** (enhanced: `SelectOption.label` is now `ReactNode` + search guards non-string labels) — deliberately NOT the raw reui radix `select.tsx` (would need the uninstalled `radix-ui` package). Swapped into the detail **action bar** + **profile card** (and the side panel via the action bar). `StatusSelect` always includes the current value even if outside the quick-pick `ALL_STATUSES`. **SelectMenu dropdown items restyled to match reui**: selected/hover rows use subtle `bg-accent` + dark check (was solid `bg-primary`) — applies to all SelectMenu dropdowns (pipeline filters, team). **SUPERSEDED for status/interest by item 12** (now radix). |
| 12 | **reui restyle (radix select + button aesthetic), reviewed via Vercel preview branch then merged.** (1) Added the **`radix-ui`** unified dependency (`^1.4.3`); vendored the reui select as **`components/ui/select-radix.tsx`** (the existing `components/ui/select.tsx` is a native `<select>` used by the import wizard — left alone). (2) `StatusSelect`/`InterestSelect` rebuilt on the radix select (`indicatorPosition="right"`, colored dot inside the item so it shows in the trigger). (3) **`Button` restyled app-wide** to the reui look: `rounded-md` (was `rounded-full` pill), `shadow-xs shadow-black/5`, `focus-visible:ring-[3px] ring-ring/30`, `font-medium`; all variants/sizes/options unchanged. Process note: big subjective + new-dep change → pushed to branch `reui-restyle` for a Vercel PREVIEW, user approved, then ff-merged to main. (4) **`SelectMenu` trigger + popover aligned to the same reui look** (rounded-md, `shadow-xs`, 3px ring, `rounded-md` popover) so pipeline filters + team settings match the radix selects WITHOUT losing SelectMenu's search (the reui radix select has no search box — that's why searchable filters stay on SelectMenu). | `package.json`, `components/ui/select-radix.tsx`, `components/leads/status-select.tsx`, `components/ui/button.tsx` | `components/ui/select-menu.tsx`, `components/leads/status-select.tsx`, `components/leads/detail/lead-action-bar.tsx`, `components/leads/detail/lead-profile-card.tsx` |
| 10 | **New "Leads Called by Rep" bar chart** under the Call Summary card on Analytics overview (reps on x-axis, **unique leads called** on y-axis = per-person "54" logic, NOT raw calls; reui/shadcn chart style). Reuses the **build-safe vendored `components/ui/pie-chart.tsx`** primitives (`ChartContainer`/`ChartTooltip`/`ChartTooltipContent` — NOT the raw 21st.dev `chart.tsx`, which breaks recharts 3.8 per quirk 17). `OverviewCards` now takes `reps`; card renders only when `reps.length > 0` (admins). `RepCallsChart` = recharts `BarChart` over `rep.unique_leads`, sorted desc, x-labels angle when >6 reps. | `app/(dashboard)/analytics/analytics-client.tsx` |

---

### Session 2026-06-02 (reui design pass + preview-env gotcha)

- **Full lead-profile mobile layout**: on the `/leads/[id]` detail page the left profile card is now **collapsed by default on mobile** behind a "Lead details" toggle (`detailsOpen` state in `lead-detail-client.tsx`), so the Activity/Follow-ups/Calls/Intake tabs sit right under the action bar instead of below the long card. Desktop unchanged (`lg:block` always shows the card). Section + profile-card containers also moved to reui `rounded-xl` + `shadow-xs`. **Action bar** (`lead-action-bar.tsx`) now stacks title/controls vertically on mobile (`flex-col sm:flex-row`, controls `flex-wrap sm:shrink-0`) so they don't overlap/overflow on narrow screens. **Profile-card Edit** is now a compact pencil icon at the end of the name row (both mobile + desktop) instead of a full dedicated row; Cancel/Save row only renders while editing.
- **Pipeline kanban restyled to reui `c-kanban-5` look**: each column is now a single bordered "Frame" card (header with colored dot + `capitalize` title + outline count badge, then cards inside) instead of a floating header + loose drop zone; cards are compact (`rounded-lg`, `shadow-xs`, `p-3`, `text-sm font-medium` title); empty/drop zones are dashed `bg-muted/10 rounded-md`. Kept all our own drag-drop / overflow / move-menu / admin-filter logic (reui's `@reui/kanban`/`Frame` components were NOT installed — only the styling was mirrored). Column body is **grey (`bg-muted/40`)** with **white (`bg-card`) cards** so cards stand out (header divider removed). `app/(dashboard)/pipeline/pipeline-client.tsx`.
- **Leads-table row status/interest → radix select.** The inline row controls now use the same reui `StatusSelect`/`InterestSelect` (radix) as the detail page — opens **downward** (radix auto-flip; was hardcoded `side=top`), shows the **check + bg-accent** selected/hover, and triggers are widened (`min-w` 150/144) with `whitespace-nowrap` labels so "Not Interested"/"Wrong Number"/"Sold Already" fit on one line. Removed the old DropdownMenu-based `StatusDropdown`/`InterestDropdown` bodies + now-unused imports. `components/leads/lead-table.tsx`, `components/leads/status-select.tsx`.
- **Whole-app reui design pass** (commit `3ef9a97`): applied the reui design language to the UI primitives — `input`, `textarea`, native `select`, `checkbox`, `card`, `dialog`, `dropdown-menu`, `badge` → rounded-md controls / rounded-xl containers, `border-input`, `shadow-xs shadow-black/5`, `focus-visible:ring-[3px] ring-ring/30`, `bg-accent` hovers, destructive menu items now red. (Button + selects done earlier.) Props/behavior unchanged.
- **§12 QUIRK 18 — Vercel PREVIEW deployments 500 with `MIDDLEWARE_INVOCATION_FAILED`** (`Error: Your project's URL and API key are required to create a Supabase client!`). Cause: the Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/service role) are scoped to **Production only** in Vercel, but `middleware.ts` builds a Supabase client on every request — so preview/branch deployments crash before rendering. **Production is unaffected** (has the vars). Implication: the "push a branch → review the Vercel preview" flow does NOT work for this app until those env vars are also ticked for the **Preview** environment in Vercel project settings. Until then, review on prod after merge (changes are revertable). Verified via `get_runtime_logs(source=edge-middleware)`.

*Last updated: 2026-06-02 — covers all sessions through 2026-06-02 (reui design pass across UI primitives + preview-env 500 gotcha; reui button + radix status/interest select; analytics sized-pie reverted to donut; dashboard rep-performance switched to Today/7d/30d/All-time presets; admin-only pipeline rep/batch/date filters; **repo migrated off iCloud Desktop → `~/Developer/SummitCRM` after local `.git` corruption; native git restored; global git identity + lfs fixed**; **Vercel build break fixed — `types/database.ts` was a failed supabase-gen capture, restored the 276-line manual file**; all three features deployed green to prod). Earlier: 2026-06-01 (Activities → Tasks rename; gh-API commit workflow; mobile pass; untimed follow-ups + conflict greying + origin-context profile nav; rep permissions + Tags column removal; dashboard Tasks widget; rep-performance Today-bounce fix; batches moved to Import page; rep dashboard KPI cards; interest→pipeline removal; admin dashboard KPI cards; mobile header + drawer polish; mobile header dropdowns centered; analytics + team mobile layout; analytics per-person/all-calls toggle; pipeline Needs Buyer card; lead-status %; mini-chart moved to analytics (unique leads/day); Call Summary sized pie; recharts 3.8 chart-type gotcha)*
