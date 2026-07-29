@AGENTS.md

# SummitCRM — AI Assistant Guide

> **Read this before touching the codebase.** It covers architecture, conventions, patterns, and gotchas.
> For the full living reference (schema details, session logs, open items), see `PROJECT_BRAIN.md`.

---

## Project Brain — AUTO-UPDATE RULE

`PROJECT_BRAIN.md` is the single source of truth for this project. **Whenever you make any change to this codebase — new feature, bug fix, schema change, route added/removed, pattern introduced, open item resolved, or quirk discovered — you MUST update the relevant section(s) of `PROJECT_BRAIN.md` in the same response before you finish.** No exceptions.

What to update and where:
- New or changed feature → Section 8 (Feature Inventory)
- New/changed route → Section 7 (Route Map)
- New/changed DB table, column, trigger, or RPC → Section 5 (Database Schema)
- New/changed file or directory → Section 6 (Directory & File Map)
- New pattern or architectural decision → Section 9 (Key Implementation Patterns)
- Bug fixed or open item resolved → Section 11 (Open Items) — mark resolved or remove
- New quirk or gotcha discovered → Section 12 (Quirks & Gotchas)
- Anything shipped this session → Section 10 (Session Log) — add to current session block
- Security model change → Section 13
- Deployment/env var change → Section 14 or 15

Update the "Last updated" line at the bottom of `PROJECT_BRAIN.md` with today's date after every edit.

---

## What This Is

**SummitCRM** is an AI-powered, multi-tenant cold outreach CRM for M&A advisory sales teams (Summit Mergers). Built with Next.js 16 App Router + Supabase + OpenAI, deployed on Vercel.

Core workflow: Import leads from CSV → work them through a pipeline → log calls → fill intake questionnaires → generate AI email snapshots → track team performance.

**What it is NOT:** no bulk email/campaigns (removed), no SMS/LinkedIn/Salesforce sync, no multi-workspace billing, no native mobile app.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.6 |
| UI | React + shadcn/ui + Radix UI | React 19.2.4 |
| Styling | Tailwind CSS 4 (CSS-first config via `globals.css`) | v4 |
| Forms | React Hook Form + Zod | RHF 7 + Zod 4 |
| Charts | Recharts | 3.8 |
| Icons | Lucide React | |
| Date utils | date-fns | 4 |
| CSV parsing | Papaparse (client-side only) | 5 |
| Excel export | xlsx | 0.18.5 |
| Docx viewer | superdoc (read-only) | 1.38.0 |
| PDF handling | unpdf (server) + pdfjs-dist (client) | |
| Word gen | docx | 9.7.1 |
| Database | Supabase (Postgres + RLS) | |
| Auth | Supabase Auth (email/password + magic link) | |
| Storage | Supabase Storage | |
| Realtime | Supabase Realtime (notifications only) | |
| AI | OpenAI API (gpt-4o, snapshot email only) | |
| Email | Resend (transactional only — invites) | |
| Hosting | Vercel (auto-deploy from `main`) | |
| Node | 22.x required | |

---

## Development Commands

```bash
npm run dev       # Dev server on port 3000
npm run build     # Production build
npm run lint      # ESLint
npx tsc --noEmit  # Type check (run before committing type-heavy changes)
```

---

## Project Structure

```
/SummitCRM
├── CLAUDE.md                 ← this file
├── AGENTS.md                 ← Next.js 16 breaking changes warning
├── PROJECT_BRAIN.md          ← single source of truth (1690+ lines)
├── SUPABASE_SETUP.md         ← Supabase provisioning guide
├── middleware.ts             ← auth + security headers + route protection
├── next.config.ts            ← serverExternalPackages, body size limit, stale times
├── app/
│   ├── globals.css           ← Tailwind v4 theme (CSS custom properties, no tailwind.config)
│   ├── layout.tsx            ← root layout (Inter + Playfair Display fonts)
│   ├── (auth)/               ← unprotected: login, signup, forgot/reset-password, accept-invite
│   ├── (dashboard)/          ← protected: all app pages (layout owns page width + padding)
│   │   ├── dashboard/        ← KPI cards, recent calls, rep performance
│   │   ├── leads/            ← lead table, [id] detail, import wizard
│   │   ├── pipeline/         ← Kanban/List/Stage views
│   │   ├── call-mode/        ← power dialer + session history
│   │   ├── tasks/            ← follow-ups + callbacks (calendar + list)
│   │   ├── analytics/        ← batch + rep analytics
│   │   ├── documents/        ← admin-only document library + PDF→Word converter
│   │   ├── admin/            ← admin dashboard
│   │   ├── batches/          ← batch management
│   │   ├── notifications/    ← notification center
│   │   └── settings/         ← profile, team, notifications, ai-usage
│   └── api/                  ← 60+ API routes (see Route Map in PROJECT_BRAIN.md §7)
├── components/
│   ├── ui/                   ← shadcn-style primitives (button, dialog, select, etc.)
│   ├── leads/                ← lead table, filters, bulk actions, detail/, import/
│   ├── admin/                ← admin dashboard panels
│   ├── analytics/            ← charts, tables, export
│   ├── auth/                 ← login/signup forms, RoleGate
│   ├── dashboard/            ← stats cards, rep performance
│   ├── layout/               ← header, sidebar, theme provider, impersonation
│   └── notifications/        ← bell, panel, context provider
├── lib/
│   ├── supabase/             ← client.ts (browser), server.ts (SSR + admin), middleware.ts
│   ├── auth/actor.ts         ← getActor() — effective identity resolver (impersonation-aware)
│   ├── ai/                   ← OpenAI client, prompts, snapshot generation, usage tracking
│   ├── import/               ← CSV import pipeline (processor, validator, mapper, inserter)
│   ├── call-mode/            ← queue builder + types
│   ├── documents/            ← admin helpers, PDF→Word conversion
│   ├── security/             ← rate-limit.ts, audit.ts
│   └── utils/                ← api.ts (response helpers), cn.ts, roles.ts, index.ts
├── hooks/                    ← useAuth, useWorkspace, useIsMobile, useTakenSlots
├── types/
│   ├── database.ts           ← HAND-MAINTAINED types (do NOT auto-generate — see Quirk 9)
│   └── index.ts              ← app-level types + re-exports
├── supabase/
│   ├── migrations/           ← 45+ migration files (apply manually via Supabase MCP)
│   └── functions/            ← Edge Functions (check-follow-ups, process-lead-import)
├── scripts/                  ← seed-documents.mjs
└── docs/                     ← 20+ spec/log files (historical reference)
```

---

## Architecture Overview

```
Browser
  └── Next.js App Router (Vercel)
        ├── Server Components (data fetch via getActor() → Supabase)
        ├── Client Components (interactivity, Realtime subscriptions)
        └── API Routes (/api/**)
              ├── Supabase RLS client (auth-scoped)
              └── Supabase Admin client (service role, cross-user ops)

Supabase
  ├── Postgres (RLS on every table, multi-tenant via workspace_id)
  ├── Auth (JWT custom claims: workspace_id + role)
  ├── Storage (lead-imports, documents, workspace-assets buckets)
  ├── Realtime (notifications table only)
  ├── Edge Functions (lead import worker, follow-up checker)
  └── pg_cron (quota reset, email queue, follow-up reminders, cleanup jobs)

OpenAI API → gpt-4o (Email Snapshot generation only)
Resend API → transactional email (team invites only)
```

**Key principle:** API-route-only architecture — no server actions. All mutations go through `/api/` routes.

---

## Auth & Identity

- **Supabase Auth** with email/password + magic link. Self-signup is disabled (403); users join via admin invitation only.
- **JWT custom claims** embed `workspace_id` and `role` via the `add_workspace_claims()` Postgres auth hook.
- **Middleware** (`middleware.ts`) refreshes session cookies on every request, protects dashboard routes, enforces admin role for `/admin` paths, and applies security headers (CSP, HSTS, X-Frame-Options, etc.).
- **`getActor()`** (`lib/auth/actor.ts`) is the **single source of truth for identity**. It resolves the effective actor (supports admin "View As" impersonation). Use it instead of inline `getUser()` + workspace lookup.

### Supabase Clients

| Client | File | When to use |
|---|---|---|
| Browser | `lib/supabase/client.ts` | Client components (RLS-scoped) |
| Server | `lib/supabase/server.ts` → `createClient()` | Server components, API routes (RLS-scoped via cookies) |
| Admin | `lib/supabase/server.ts` → `createAdminClient()` | Cross-user reads (invites, member lists). Bypasses RLS — use cautiously |
| Middleware | `lib/supabase/middleware.ts` | Middleware only (cookie refresh) |

---

## Roles & Permissions

Five DB roles: `super_admin > admin > manager > rep > viewer`

**TypeScript only defines 3:** `super_admin`, `admin`, `rep` (in `lib/utils/roles.ts`). The `viewer` and `manager` roles exist in the DB enum but are not in the TS type system.

Role checks happen at two layers (defense-in-depth):
1. **API routes** check roles in-route before mutations
2. **RLS policies** enforce at the database layer

Pipeline visibility: reps see only assigned leads. Admins/managers see all. Enforced server-side (RPC bypasses RLS).

---

## Key Patterns to Follow

### Identity resolution
```typescript
const actor = await getActor();
if (!actor) redirect('/login');
// Use actor.userId (effective), actor.role, actor.workspaceId
// Use actor.realUserId only for admin-specific checks
```

### API response helpers
```typescript
import { apiSuccess, apiError, apiUnauthorized, apiForbidden, apiNotFound } from '@/lib/utils/api';
return apiSuccess(data);
return apiError('Message', 400);
```

### Bypassing PostgREST 1000-row cap
Use single-row jsonb RPCs — `.range()` and `.limit()` do NOT bypass the server-side cap.

### User lookups
Never call `adminClient.auth.admin.listUsers()` in hot paths. Use `lib/users.ts` which wraps SECURITY DEFINER RPCs.

### Call counts
`call_logs` is the single source of truth. Never use `activity_logs` for call counting (causes double-counting).

### Lead search
Must match multi-word queries token-by-token. Use `lead_search_match()` SQL helper or the per-token chained `.or()` pattern. Never use a single `%query%` predicate.

### Page width
The dashboard layout (`app/(dashboard)/layout.tsx`) owns page width + horizontal padding. Dashboard pages must NOT add their own `mx-auto max-w-*` or `px-*` shell. Exceptions: reading/form columns (call-mode dialer, settings, notifications) that cap their own width.

### Portal for overlays
Header is `sticky top-0 z-20` creating a stacking context. For overlays that need to escape it, use `createPortal(content, document.body)` with `position: fixed`.

### Supabase query builder gotcha
The query builder is a thenable, NOT a Promise — it has `.then()` but no `.catch()`. Use `try { await builder } catch {}` for best-effort writes, never `.catch()`.

---

## Critical Gotchas

1. **Next.js 16 breaking changes** — Read `node_modules/next/dist/docs/` before writing any code. APIs and conventions differ from training data.

2. **`types/database.ts` is hand-maintained** — Do NOT auto-generate with `supabase gen types`. A previous attempt wrote npm error output into the file and broke the build. Only regenerate if the Supabase CLI is properly configured AND verify the output is real TS.

3. **Tailwind v4 uses CSS-first config** — Theme is in `app/globals.css` via `@theme inline`, not a `tailwind.config.*` file.

4. **`unpdf` for server-side PDF, not raw `pdfjs-dist`** — pdfjs fails in Vercel serverless (DOMMatrix not defined). `serverExternalPackages: ['unpdf']` is required in next.config.

5. **CSP blocks cross-origin iframes** — Use the same-origin proxy at `/api/documents/[id]/raw` instead of embedding Supabase signed URLs directly.

6. **Recharts in hidden tabs renders empty** — rAF never fires in background tabs; charts show axes but zero-size data elements. This is expected, not a bug.

7. **`VOLATILE` required for RPCs using temp tables** — `STABLE`/`IMMUTABLE` functions can't `CREATE TEMP TABLE`.

8. **Notifications require explicit Realtime enrollment** — `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications`. Supabase doesn't add tables automatically.

9. **Migrations applied manually** — Via Supabase MCP or `supabase db push`. Never apply without explicit user authorization. Preview deployments use the prod DB.

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | All Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser + SSR clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Admin client (server-only) |
| `OPENAI_API_KEY` | For AI | Server-only |
| `RESEND_API_KEY` | For email | Transactional only |
| `RESEND_FROM_EMAIL` | For email | Sender address |
| `NEXT_PUBLIC_APP_URL` | Yes | Redirects, deeplinks |
| `NEXT_PUBLIC_APP_NAME` | Yes | Display name |
| `NEXT_PUBLIC_FEATURE_AI` | For AI | Feature flag for snapshot button |
| `NEXT_PUBLIC_FEATURE_CAMPAIGNS` | Optional | Feature flag (campaigns disabled) |
| `NEXT_PUBLIC_FEATURE_ANALYTICS` | Optional | Feature flag |

See `.env.local.example` for the full template.

---

## Deployment

| Environment | Branch | Host | DB |
|---|---|---|---|
| Production | `main` | Vercel | Supabase `nmcyxulluascofmsgkxr` |
| Preview | Every PR | Vercel | Uses prod DB — be careful |

CI/CD: GitHub → Vercel auto-deploy on push to `main`. Lint + type check on push.

---

## Security Model (Summary)

- **Multi-tenancy:** RLS on every table via `workspace_id`. JWT custom claims.
- **Two-layer auth:** API routes validate role + RLS enforces at DB layer.
- **Rate limiting:** In-memory sliding window on invite accept (5/5min), invite send (10/min), AI snapshot (20/min).
- **Secrets:** Supabase Vault for sensitive credentials. Never in DB tables.
- **Impersonation:** App-layer only (cookie-based, re-verified every request, audited). See PROJECT_BRAIN.md §8 and §13.
- **Security headers:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy on every response.
- **Soft deletes:** Leads and notes use `deleted_at` (hard-purge via weekly pg_cron after 30 days).

---

## Testing

No test framework is currently configured. `docs/14-testing-plan.md` exists as a spec. When adding tests, consider Vitest for unit/integration and Playwright for E2E (Chromium is pre-installed in the remote environment).

---

## Skill Routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

---

## Key Files by Blast Radius

| File | Fan-in | Risk |
|---|---|---|
| `lib/supabase/server.ts` | 78+ importers | Highest — all server-side Supabase access |
| `hooks/index.ts` | 81 fan-in | Barrel export for all hooks |
| `components/leads/lead-full-panel.tsx` | 16 fan-out | Most complex component |
| `components/leads/leads-client.tsx` | 16 fan-out | Lead table with filters + bulk ops |
| `lib/auth/actor.ts` | All pages + routes | Identity resolution — test changes carefully |
| `middleware.ts` | Every request | Auth + security headers |
| `types/database.ts` | All typed Supabase queries | Hand-maintained — verify before editing |
