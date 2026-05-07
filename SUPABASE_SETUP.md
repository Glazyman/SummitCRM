# Supabase Setup Instructions

Complete step-by-step guide to provision the Summits CRM database from scratch.

---

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed (`brew install supabase/tap/supabase`)
- Node.js 18+ and npm
- A Supabase account at [supabase.com](https://supabase.com)

---

## Step 1 — Create the Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com) → **New project**
2. Fill in:
   - **Name**: `summits-crm` (or your preferred name)
   - **Database password**: generate a strong password — save it securely
   - **Region**: choose closest to your users
3. Wait ~2 minutes for provisioning

---

## Step 2 — Enable Required Extensions

In the Supabase Dashboard:

1. Go to **Database → Extensions**
2. Enable each of the following:
   - `pg_cron` — for scheduled jobs (quota reset, digests, reminders)
   - `pg_net` — for HTTP calls from Postgres (pg_cron → Edge Functions)
   - `pgcrypto` — for `gen_random_uuid()` (may already be enabled)

> **Note**: `pg_cron` and `pg_net` are only available on paid Supabase plans (Pro+).
> On free tier, you can replace cron jobs with Vercel Cron Jobs that call Edge Functions directly.

---

## Step 3 — Configure the Supabase CLI

```bash
# Link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Verify the link
supabase status
```

Replace `YOUR_PROJECT_REF` with the value from your project URL:
`https://app.supabase.com/project/YOUR_PROJECT_REF`

---

## Step 4 — Update pg_cron Edge Function URLs

Before applying migrations, replace the placeholder in `migration 011`:

```bash
# In supabase/migrations/20260507000011_cron_jobs.sql
# Replace ALL occurrences of:
YOUR_PROJECT_REF
# With your actual project ref, e.g.:
abcdefghijklmnop
```

You can do this with:
```bash
sed -i '' 's/YOUR_PROJECT_REF/YOUR_ACTUAL_REF/g' \
  supabase/migrations/20260507000011_cron_jobs.sql
```

---

## Step 5 — Apply All Migrations

```bash
# Dry-run first to preview SQL
supabase db push --dry-run

# Apply all migrations to remote project
supabase db push
```

Migrations are applied in filename order:
| File | Description |
|------|-------------|
| `20260507000001_extensions.sql` | Enable pg_cron, pg_net, pgcrypto |
| `20260507000002_enums.sql` | All domain enums |
| `20260507000003_core_tables.sql` | workspaces, workspace_members, invitations |
| `20260507000004_lead_tables.sql` | lead_batches, lead_imports, leads, notes |
| `20260507000005_email_tables.sql` | sending_accounts, emails, email_queue |
| `20260507000006_campaign_tables.sql` | campaigns, campaign_sequence_steps |
| `20260507000007_activity_and_notification_tables.sql` | activity_logs, notifications, ai tables, follow_ups, unsubscribes, audit_logs |
| `20260507000008_functions.sql` | Helper functions + JWT hook |
| `20260507000009_triggers.sql` | updated_at, lead_count, stats, immutability |
| `20260507000010_rls_policies.sql` | All Row Level Security policies |
| `20260507000011_cron_jobs.sql` | pg_cron scheduled jobs |
| `20260507000012_storage.sql` | Storage buckets + access policies |

---

## Step 6 — Configure the Custom JWT Hook

This adds `workspace_id` and `role` to every JWT so middleware can check permissions without a DB query.

1. Go to Supabase Dashboard → **Authentication → Hooks**
2. Under **Custom Access Token**, click **Add hook**
3. Set:
   - **Hook type**: `HTTP`... actually use **PostgreSQL function**
   - **Schema**: `public`
   - **Function**: `add_workspace_claims`
4. Save

> After this, every new JWT will contain `app_metadata.workspace_id` and `app_metadata.role`.
> **Existing sessions must be refreshed** (sign out and back in) to get the new claims.

---

## Step 7 — Set Up Supabase Vault (Sending Account Credentials)

Sending account API keys and SMTP passwords are stored in Supabase Vault, not in plain columns.

### Enable Vault
1. Go to **Database → Vault**
2. Vault is enabled by default on all projects

### Store a secret
When adding a sending account via the API, the server-side code should:

```typescript
// In your API route (server-side, using admin client)
const { data: secret } = await supabaseAdmin
  .rpc('vault_create_secret', {
    secret: resendApiKey,
    name: `resend_${accountId}`,
    description: 'Resend API key for sending account'
  })

// Store only the secret ID in the database
await supabaseAdmin
  .from('sending_accounts')
  .update({ resend_api_key_vault_id: secret.id })
  .eq('id', accountId)
```

### Retrieve a secret (in Edge Function)
```typescript
const { data } = await supabaseAdmin
  .rpc('vault_decrypt_secret', { secret_id: account.resend_api_key_vault_id })
const apiKey = data.decrypted_secret
```

---

## Step 8 — Configure Storage Buckets

The migration attempts to create buckets via SQL, but if it fails, create them manually:

1. Go to **Storage** in the dashboard
2. Create three buckets:

| Bucket | Public | Max Size | Allowed Types |
|--------|--------|----------|---------------|
| `lead-imports` | No | 10 MB | CSV, Excel |
| `workspace-assets` | Yes | 5 MB | Images |
| `email-attachments` | No | 24 MB | PDF, Images, Office |

---

## Step 9 — Configure Environment Variables

### Fill in `.env.local`

```bash
cp .env.local.example .env.local
```

Then edit `.env.local`:

```bash
# From Supabase Dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # anon public key
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # service_role key (NEVER expose to client)

# From OpenAI Dashboard
OPENAI_API_KEY=sk-proj-...

# From Resend Dashboard
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...

NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Summits CRM
```

### Production (Vercel)

```bash
# Push env vars to Vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# ... repeat for all vars
```

Or use the Vercel dashboard under **Settings → Environment Variables**.

---

## Step 10 — Configure Authentication

### Email Provider
1. Go to **Authentication → Providers**
2. Ensure **Email** is enabled
3. Configure:
   - **Confirm email**: Enabled (recommended for production)
   - **Secure email change**: Enabled

### Email Templates
1. Go to **Authentication → Email Templates**
2. Customise the templates to match your brand

### Redirect URLs
1. Go to **Authentication → URL Configuration**
2. Add to **Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   https://your-domain.com/auth/callback
   ```

---

## Step 11 — Verify the Schema

Run these verification queries in the Supabase SQL editor:

```sql
-- 1. Check all tables have RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Every row should show rowsecurity = true

-- 2. Check all expected tables exist
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: activity_logs, ai_draft_cache, ai_usage_logs, audit_logs,
--           campaign_sequence_steps, campaigns, email_queue, emails,
--           follow_ups, invitations, lead_batches, lead_imports, leads,
--           notification_preferences, notifications, notes, sending_accounts,
--           unsubscribes, workspace_members, workspaces

-- 3. Check enums
SELECT typname FROM pg_type
WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace
ORDER BY typname;
-- Expected: activity_type, campaign_status, email_status,
--           lead_status, notification_type, sending_account_type, workspace_role

-- 4. Check RLS policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5. Check indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 6. Check functions exist
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
ORDER BY proname;
-- Expected: add_workspace_claims, check_unsubscribed, cleanup_ai_cache,
--           cleanup_old_notifications, get_my_role, get_user_workspace_id,
--           has_role, increment_sending_quota, is_admin, is_manager_or_above,
--           is_workspace_member, log_activity, reset_all_quotas, role_rank,
--           try_increment_quota

-- 7. Verify pg_cron jobs
SELECT jobname, schedule, active
FROM cron.job
ORDER BY jobname;
```

---

## Step 12 — Test RLS Policies

Test role-based access by simulating queries as different users:

```sql
-- Test as a specific user (replace with real user_id)
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "USER_UUID_HERE", "role": "authenticated"}';

-- This should only return leads assigned to this user (if they're a rep)
SELECT id, email, status, assigned_to FROM leads LIMIT 5;

-- Test as an admin
SET LOCAL request.jwt.claims TO '{"sub": "ADMIN_UUID_HERE", "role": "authenticated"}';

-- This should return all leads in the workspace
SELECT id, email, status, assigned_to FROM leads LIMIT 5;
```

Or use the Supabase [RLS Policy Testing guide](https://supabase.com/docs/guides/auth/row-level-security#testing-policies).

---

## Step 13 — Local Development Setup

For local development with a local Supabase instance:

```bash
# Start local Supabase stack
supabase start

# This outputs local URLs and keys — use these in .env.local for dev
# NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Apply migrations to local DB
supabase db reset  # resets and re-applies all migrations

# Open local Supabase Studio
open http://127.0.0.1:54323

# Stop local Supabase
supabase stop
```

---

## Security Checklist

Before going to production, verify:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is **never** in client-side code or committed to git
- [ ] All tables have RLS enabled (Step 11, query 1)
- [ ] `email_queue` has no permissive policies (only service role access)
- [ ] `audit_logs` has no INSERT/UPDATE/DELETE client policies
- [ ] Sending account credential columns return `null` or Vault IDs to client (never raw keys)
- [ ] JWT hook `add_workspace_claims` is registered in Supabase Dashboard
- [ ] Storage buckets created with correct visibility (lead-imports: private)
- [ ] Redirect URLs configured for auth callbacks
- [ ] pg_cron jobs are active (`SELECT * FROM cron.job`)
- [ ] Database password is strong and stored in a password manager
- [ ] Supabase project has 2FA enabled on the account

---

## Common Issues

### "relation does not exist" error during migration
- Migrations run in filename order. If you see this, a dependency table hasn't been created yet.
- Check the migration file order and ensure all files have the correct `2026050700000X_` prefix.

### RLS blocking legitimate queries
- Check which role the user has: `SELECT get_my_role('YOUR_WORKSPACE_ID'::uuid)`
- Verify the user is in `workspace_members` with `is_active = true`
- Check the policy using `EXPLAIN (ANALYZE, BUFFERS) SELECT ...`

### pg_cron not available (free tier)
- Replace cron jobs with [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- Create `vercel.json` with cron configuration calling your API routes

### JWT claims not showing workspace_id
- Ensure the `add_workspace_claims` hook is registered in Auth → Hooks
- The user must have a row in `workspace_members` with `is_active = true`
- Existing sessions need to be refreshed (sign out → sign in)
