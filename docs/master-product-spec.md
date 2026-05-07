# Master Product Specification — Summits CRM

> AI-powered cold outreach CRM for modern sales teams.

---

## 1. Product Vision

Summits CRM is a multi-tenant, AI-enhanced customer relationship management platform purpose-built for cold outreach teams. It enables teams to import leads, personalise emails with AI, manage campaigns, track activity, and collaborate — all within a single, fast, and secure application.

---

## 2. Core Principles

- **AI-first**: Every workflow that can benefit from AI (personalisation, follow-up suggestions, lead scoring) should offer it.
- **Team-centric**: Multiple users per workspace with role-based access control.
- **Rate-safe**: Hard limits and queuing ensure accounts never exceed sending thresholds.
- **Audit-ready**: Every meaningful action is logged in an immutable activity trail.
- **Token-efficient**: Expensive AI calls are batched, cached, and gated behind explicit user actions.

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui |
| Backend / DB | Supabase (Postgres, Auth, Storage, Edge Functions, Realtime) |
| Hosting | Vercel (production + preview deployments) |
| Email Delivery | Resend (primary) with SMTP fallback |
| AI | OpenAI API (GPT-4o for complex tasks, GPT-4o-mini for high-volume) |
| Queue / Scheduler | Supabase pg_cron + Edge Functions |
| File Storage | Supabase Storage (CSV uploads) |
| Monitoring | Vercel Analytics + Supabase logs |

---

## 4. User Roles

| Role | Description |
|---|---|
| `super_admin` | Platform owner. Full access. Manages workspaces. |
| `admin` | Workspace owner. Manages team, billing, sending accounts. |
| `manager` | Creates and manages campaigns, views all team analytics. |
| `rep` | Creates leads, sends emails, manages own pipeline. |
| `viewer` | Read-only access to assigned leads and reports. |

---

## 5. Top-Level Feature Modules

### 5.1 Lead Management
- Bulk CSV import with field mapping
- Manual lead creation
- Lead batches (grouping leads for campaigns)
- Lead statuses: `new`, `contacted`, `replied`, `interested`, `not_interested`, `do_not_contact`, `unsubscribed`, `converted`
- Custom fields per workspace
- Notes and attachments per lead

### 5.2 Email System
- Multiple sending accounts per workspace (connected via SMTP or Resend API)
- 50 email/day hard limit per sending account
- Daily quota tracking and reset via pg_cron
- Transactional single emails
- Bulk campaign emails with scheduling
- Open/click tracking via pixel and redirect proxy
- Unsubscribe handling

### 5.3 AI Personalisation
- Per-lead personalised email generation using OpenAI
- Uses lead data: name, company, title, website, LinkedIn summary
- Tone selection (professional, casual, direct)
- Subject line generation
- Follow-up email generation
- Batch personalisation for campaigns (queued)
- Token usage tracked per workspace

### 5.4 Campaign System
- Campaign builder: name, template, target batch, sending account, schedule
- Campaign statuses: `draft`, `scheduled`, `running`, `paused`, `completed`, `cancelled`
- Per-lead personalisation within campaign
- Respects daily sending limits (queues overflow to next day)
- Campaign analytics: sent, opened, clicked, replied, bounced

### 5.5 Activity Tracking
- All emails sent logged
- Opens and clicks tracked
- Replies detected (via inbound webhook or polling)
- Notes added
- Status changes logged
- Lead imports logged
- AI actions logged
- Timeline view per lead

### 5.6 Follow-ups
- Manual follow-up scheduling
- AI-suggested follow-up timing
- Automated follow-up sequences (step 1 → wait N days → step 2)
- Follow-up notifications

### 5.7 Notifications
- In-app notifications (Supabase Realtime)
- Email digests (daily/weekly)
- Alerts: reply received, bounce, quota warning (80% / 100%)

### 5.8 Dashboards
- **Rep dashboard**: My leads, my emails, my tasks, my activity
- **Admin dashboard**: Team performance, account health, quota usage, campaign overview
- **Analytics**: Email performance metrics, lead funnel, conversion rates, time-to-reply

### 5.9 Team Management
- Invite team members by email
- Assign roles
- Deactivate members
- Audit log of admin actions

---

## 6. Data Flow Overview

```
User → Next.js App → Supabase (Postgres RLS) → Supabase Edge Functions
                                              → OpenAI API
                                              → Resend / SMTP
                                              → pg_cron (scheduled jobs)
```

---

## 7. Multi-Tenancy Model

- Each organisation is a **workspace**.
- All data rows carry a `workspace_id` foreign key.
- Row Level Security (RLS) policies enforce workspace isolation at the database layer.
- Users belong to exactly one workspace (MVP). Multi-workspace support is a v2 feature.

---

## 8. Security Model

- Authentication via Supabase Auth (email/password, magic link, optional SSO in v2)
- All database access through RLS policies — no client-side full-table reads
- API keys (OpenAI, Resend, SMTP credentials) stored encrypted in Supabase Vault
- GDPR-friendly: unsubscribe lists, data export, data deletion
- Audit log for all sensitive operations

---

## 9. AI Usage Strategy

| Task | Model | Rationale |
|---|---|---|
| Email personalisation (single) | `gpt-4o` | Quality matters for 1:1 outreach |
| Batch personalisation | `gpt-4o-mini` | Cost at scale |
| Subject line generation | `gpt-4o-mini` | Simple task |
| Follow-up suggestions | `gpt-4o-mini` | Low complexity |
| Lead scoring / enrichment | `gpt-4o-mini` | High volume |
| Complex reasoning / planning | `gpt-4o` | Low frequency |

All AI calls are:
- Token-counted and stored
- Rate-limited per workspace
- Cached where the input is identical
- Opt-in (never auto-triggered without user action)

---

## 10. Document Index

| File | Topic |
|---|---|
| `00-roadmap.md` | Release phases and milestones |
| `01-architecture.md` | System architecture and deployment |
| `02-auth-and-roles.md` | Authentication, roles, RLS policies |
| `03-database-schema.md` | Full Postgres schema |
| `04-lead-import.md` | CSV import, field mapping, validation |
| `05-lead-dashboard.md` | Lead list, filters, bulk actions |
| `06-lead-detail-and-activity.md` | Lead profile, timeline, notes |
| `07-email-system.md` | Single email, sending accounts, quota |
| `08-bulk-email-system.md` | Campaigns, scheduling, sequences |
| `09-ai-enrichment.md` | Personalisation, scoring, follow-ups |
| `10-admin-dashboard.md` | Team view, account health, quota |
| `11-analytics.md` | Email metrics, funnel, conversions |
| `12-notifications-and-reminders.md` | In-app, email digests, alerts |
| `13-security-and-compliance.md` | RLS, vault, GDPR, audit |
| `14-testing-plan.md` | Unit, integration, E2E strategy |
| `15-token-saving-workflow.md` | AI cost control patterns |

---

## 11. Out of Scope (MVP)

- Native mobile app
- Phone / SMS outreach
- LinkedIn integration
- CRM sync (Salesforce, HubSpot)
- Multi-workspace membership
- Custom domain email tracking
- Billing / subscription management (can be added in v2 via Stripe)
