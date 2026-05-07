# 01 — Architecture

## Goal
Define the full system architecture: how services connect, how data flows, how the app is deployed, and where boundaries live.

---

## High-Level Diagram

```
┌─────────────────────────────────────────────────┐
│                   Vercel (Edge)                  │
│  ┌─────────────────────────────────────────────┐ │
│  │            Next.js App (App Router)          │ │
│  │                                             │ │
│  │  ┌──────────────┐  ┌──────────────────────┐ │ │
│  │  │  React Pages │  │  API Route Handlers  │ │ │
│  │  │  /app/...    │  │  /app/api/...        │ │ │
│  │  └──────────────┘  └──────────┬───────────┘ │ │
│  └─────────────────────────────┬─┘─────────────┘ │
└────────────────────────────────│─────────────────┘
                                 │
              ┌──────────────────┼───────────────────┐
              ▼                  ▼                    ▼
   ┌──────────────────┐  ┌─────────────┐  ┌──────────────────┐
   │  Supabase        │  │  OpenAI API │  │  Resend / SMTP   │
   │  - Postgres DB   │  │  GPT-4o     │  │  Email Delivery  │
   │  - Auth          │  │  GPT-4o-mini│  └──────────────────┘
   │  - Storage       │  └─────────────┘
   │  - Edge Functions│
   │  - Realtime      │
   │  - pg_cron       │
   └──────────────────┘
```

---

## Component Breakdown

### 1. Next.js App (Vercel)

**Role**: Frontend rendering + API layer + server-side logic

**Directory structure**:
```
/app
  /api                    ← API Route handlers (server-side)
    /leads/...
    /campaigns/...
    /emails/...
    /ai/...
    /webhooks/...
  /(auth)                 ← Auth pages (login, signup, invite)
  /(dashboard)            ← Protected app pages
    /dashboard
    /leads
    /leads/[id]
    /campaigns
    /campaigns/[id]
    /analytics
    /settings
    /admin
/components               ← Shared UI components
/lib
  /supabase               ← Supabase client (server + browser)
  /openai                 ← OpenAI client
  /resend                 ← Resend client
  /email-queue            ← Queue helpers
  /utils
/hooks                    ← React hooks
/types                    ← TypeScript types generated from Supabase
```

**Rendering strategy**:
- **Server Components** (default): Lead lists, dashboards, analytics — data fetched server-side via Supabase server client.
- **Client Components**: Interactive forms, real-time feeds, modals, email compose.
- **API Routes**: Mutations, AI calls, email sends, webhooks.

### 2. Supabase

**Role**: Database, authentication, file storage, background jobs, real-time events.

#### Postgres Database
- All application data
- Row Level Security on every table
- `workspace_id` on every user-facing table for multi-tenancy

#### Supabase Auth
- Email/password login
- Magic link login
- JWT tokens used by Next.js server client
- Custom claims for role and workspace

#### Supabase Storage
- CSV uploads for lead imports (bucket: `lead-imports`)
- Scoped to workspace

#### Supabase Edge Functions
- `process-email-queue` — dequeue and send emails
- `process-campaign` — expand a campaign into per-lead email queue entries
- `reset-daily-quotas` — called by pg_cron at midnight UTC
- `handle-email-webhook` — receive open/click/bounce events from Resend

#### pg_cron Jobs
- `reset-daily-quotas`: `0 0 * * *` (midnight UTC)
- `process-email-queue`: `*/2 * * * *` (every 2 minutes)
- `send-daily-digest`: `0 8 * * *` (8am UTC)
- `check-follow-ups`: `0 9 * * *` (9am UTC)

#### Supabase Realtime
- `notifications` table changes → push to subscribed clients
- Used for in-app notification bell

### 3. OpenAI API

**Role**: AI personalisation, subject line generation, follow-up suggestions.

- Called from Next.js API routes (never client-side — key stays server-side)
- Token usage logged in `ai_usage_logs` table
- Per-workspace monthly token cap (soft limit + alert)

### 4. Resend

**Role**: Primary transactional and campaign email delivery.

- API key stored in Supabase Vault / environment variables
- Webhook endpoint: `/api/webhooks/resend` — receives open, click, bounce, unsubscribe events
- Per-sending-account API keys supported

### 5. SMTP Fallback

**Role**: Alternative delivery for users who prefer Gmail/Outlook SMTP.

- Credentials stored encrypted in Supabase Vault
- `nodemailer` used in Edge Functions / API routes
- Same quota system applies

---

## Authentication Flow

```
1. User visits app
2. Next.js middleware checks Supabase session cookie
3. If no session → redirect to /login
4. After login → Supabase sets httpOnly session cookie
5. All subsequent requests carry the session
6. Server components call supabase.auth.getUser() to identify user
7. API routes verify session before any mutation
```

**Middleware** (`/middleware.ts`):
- Protects all `/app/(dashboard)/**` routes
- Refreshes session token on each request
- Reads workspace_id from user metadata

---

## Data Access Patterns

| Pattern | Method |
|---|---|
| Server Component data fetch | Supabase server client with RLS |
| Client-side reads | Supabase browser client with RLS |
| Mutations | Next.js API Routes (POST/PATCH/DELETE) |
| Background jobs | Supabase Edge Functions |
| File uploads | Supabase Storage presigned URLs |
| Real-time | Supabase Realtime channel subscriptions |

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # Server-only, never exposed to client

# OpenAI
OPENAI_API_KEY=                  # Server-only

# Resend
RESEND_API_KEY=                  # Server-only (default workspace key)

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_APP_NAME=Summits CRM

# Feature flags
NEXT_PUBLIC_FEATURE_AI=true
NEXT_PUBLIC_FEATURE_CAMPAIGNS=true
```

---

## Deployment Architecture

### Vercel
- **Production**: `main` branch → `summitscrm.com`
- **Staging**: `staging` branch → `staging.summitscrm.com`
- **Preview**: Every PR gets an isolated preview URL

### Supabase
- **Production**: Separate Supabase project
- **Staging**: Separate Supabase project (same schema)
- Migrations applied via Supabase CLI (`supabase db push`)

### CI/CD Pipeline (GitHub Actions)
```yaml
on: [push, pull_request]
jobs:
  lint:       # ESLint + TypeScript check
  test:       # Vitest unit tests
  e2e:        # Playwright (staging only)
  deploy:     # Vercel deployment (auto via Vercel GitHub integration)
```

---

## Performance Targets

| Metric | Target |
|---|---|
| Time to First Byte (TTFB) | < 200ms |
| Lead list load (500 leads) | < 1s |
| Email send API response | < 2s |
| AI draft generation | < 5s |
| Campaign queue processing | 50 emails / 2 min batch |

---

## Scalability Considerations

- Supabase Postgres handles up to millions of rows — `workspace_id` indexes critical
- Email queue is pull-based (pg_cron poll) — no hot path on the web server
- AI calls are async — UI shows loading state, result stored in DB
- Vercel Edge handles global CDN + serverless scaling automatically
- pg_cron job concurrency: use advisory locks to prevent double-processing
