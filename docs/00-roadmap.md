# 00 — Roadmap

## Goal
Define release phases, milestones, and feature priorities to keep development focused and shippable.

---

## Phase Overview

| Phase | Name | Target | Description |
|---|---|---|---|
| **P0** | Foundation | Week 1–2 | Repo, DB, auth, roles, CI/CD |
| **P1** | Core CRM | Week 3–5 | Lead import, lead management, notes |
| **P2** | Email Engine | Week 6–8 | Sending accounts, single email, quota |
| **P3** | Campaigns | Week 9–11 | Bulk email, sequences, scheduling |
| **P4** | AI Layer | Week 12–13 | Personalisation, follow-up suggestions |
| **P5** | Analytics | Week 14–15 | Dashboards, metrics, funnel |
| **P6** | Notifications | Week 16 | In-app, digest emails, alerts |
| **P7** | Admin Tools | Week 17 | Team management, audit log, quota health |
| **P8** | Hardening | Week 18–19 | Security review, testing, performance |
| **P9** | Launch | Week 20 | Production deployment, monitoring |

---

## Phase P0 — Foundation

**Goal**: Working Next.js + Supabase project with auth, CI/CD, and base DB.

### Tasks
- [ ] Init Next.js 14 project with Tailwind + shadcn/ui
- [ ] Connect Supabase project
- [ ] Configure Supabase Auth (email/password + magic link)
- [ ] Create `workspaces`, `users`, `workspace_members` tables
- [ ] Implement RLS baseline policies
- [ ] Set up Vercel project with environment variables
- [ ] Set up GitHub Actions CI (lint + type check)
- [ ] Create `/docs` folder with planning files

### Milestone
> New user can sign up, create a workspace, and land on a dashboard.

---

## Phase P1 — Core CRM

**Goal**: Reps can import leads, view them, update statuses, and add notes.

### Tasks
- [ ] CSV import with field mapping UI
- [ ] Lead list view with search + filters
- [ ] Lead detail page
- [ ] Lead status management
- [ ] Notes CRUD
- [ ] Lead batch creation and assignment
- [ ] Activity log (manual events)

### Milestone
> A rep can import 500 leads from CSV, view their pipeline, and add notes.

---

## Phase P2 — Email Engine

**Goal**: Team can send individual emails through connected accounts with quota tracking.

### Tasks
- [ ] Sending account connection UI (Resend API key or SMTP)
- [ ] Daily quota counter (50/day per account)
- [ ] pg_cron reset job (midnight UTC)
- [ ] Single email compose + send from lead detail
- [ ] Email logs table
- [ ] Open/click tracking pixel + redirect
- [ ] Unsubscribe link handling

### Milestone
> A rep can connect a Gmail SMTP, send an email to a lead, and see it logged.

---

## Phase P3 — Campaigns

**Goal**: Team can run bulk email campaigns to lead batches with scheduling.

### Tasks
- [ ] Campaign builder UI
- [ ] Template system with merge variables
- [ ] Campaign execution queue (Edge Function + pg_cron)
- [ ] Respect daily limits, queue overflow
- [ ] Campaign status tracking
- [ ] Follow-up sequence builder (multi-step)
- [ ] Pause / resume / cancel campaigns

### Milestone
> An admin can schedule a 300-lead campaign across 2 sending accounts and it executes respecting limits.

---

## Phase P4 — AI Layer

**Goal**: Reps and campaigns can use OpenAI to generate personalised emails and follow-up suggestions.

### Tasks
- [ ] Single-lead AI email generation UI
- [ ] Batch AI personalisation for campaigns
- [ ] Subject line AI generation
- [ ] Follow-up suggestion (AI-based timing + content)
- [ ] Token usage tracking per workspace
- [ ] AI action logging in activity feed

### Milestone
> A rep clicks "AI Draft" on a lead, reviews a personalised email, edits if needed, and sends.

---

## Phase P5 — Analytics

**Goal**: Managers and admins can measure email and campaign performance.

### Tasks
- [ ] Email metrics aggregation (sent, open rate, click rate, reply rate, bounce rate)
- [ ] Campaign-level analytics page
- [ ] Lead funnel view (new → contacted → replied → converted)
- [ ] Team member performance table
- [ ] Date range filters
- [ ] CSV export of analytics data

### Milestone
> An admin can view last 30 days: total emails sent, open rate by campaign, and top-performing rep.

---

## Phase P6 — Notifications

**Goal**: Team members are notified of important events without leaving the app.

### Tasks
- [ ] In-app notification bell (Supabase Realtime)
- [ ] Notification types: reply received, bounce, quota warning, campaign complete
- [ ] Mark as read / dismiss
- [ ] Daily email digest (pg_cron + Resend)
- [ ] Notification preferences per user

### Milestone
> A rep receives an in-app notification when a lead replies, and an email digest each morning.

---

## Phase P7 — Admin Tools

**Goal**: Admins can manage team, sending accounts, and monitor workspace health.

### Tasks
- [ ] Team member invite / deactivate
- [ ] Role assignment UI
- [ ] Sending account health dashboard (quota, bounces, errors)
- [ ] Workspace audit log
- [ ] Admin-only analytics overlay

### Milestone
> An admin can invite 5 reps, assign roles, and see which sending account is at 80% quota.

---

## Phase P8 — Hardening

**Goal**: Production-ready security, performance, and test coverage.

### Tasks
- [ ] RLS policy audit (all tables)
- [ ] Supabase Vault for secrets
- [ ] Rate limiting on API routes
- [ ] E2E tests (Playwright) for critical paths
- [ ] Load test campaign queue (500 leads)
- [ ] GDPR: unsubscribe flow, data export, data deletion
- [ ] Accessibility audit (WCAG AA)

### Milestone
> All critical paths have E2E coverage, RLS audit passes, secrets stored in Vault.

---

## Phase P9 — Launch

**Goal**: Production deployment with monitoring and runbook.

### Tasks
- [ ] Vercel production environment
- [ ] Custom domain + SSL
- [ ] Supabase production project (separate from staging)
- [ ] Error monitoring (Sentry or Vercel)
- [ ] Uptime monitoring
- [ ] Internal runbook (how to deploy, rollback, debug)
- [ ] Seed data for demo workspace

### Milestone
> App is live on production domain with zero downtime deployment pipeline.

---

## Feature Flag Strategy

Use environment variables for feature flags during development:

```env
NEXT_PUBLIC_FEATURE_AI=true
NEXT_PUBLIC_FEATURE_CAMPAIGNS=true
NEXT_PUBLIC_FEATURE_ANALYTICS=false
```

This allows disabling incomplete features in production while work continues.

---

## Dependency Map

```
P0 (Foundation)
  └── P1 (Core CRM)
        ├── P2 (Email Engine)
        │     └── P3 (Campaigns)
        │           └── P4 (AI Layer)
        └── P5 (Analytics) — depends on P2 data
P6 (Notifications) — depends on P2 + P3 events
P7 (Admin Tools) — depends on P1 + P2 data
P8 (Hardening) — depends on all features
P9 (Launch) — depends on P8
```
