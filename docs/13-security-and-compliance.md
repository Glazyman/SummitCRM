# 13 — Security & Compliance

## Goal
Ensure the application is secure against common vulnerabilities, handles sensitive credentials safely, respects user privacy rights, and maintains an auditable record of all significant actions.

---

## Features

- Row Level Security (RLS) on every database table
- Supabase Vault for API keys and SMTP passwords
- Input validation and sanitisation on all API routes
- Rate limiting on auth and AI endpoints
- HTTPS enforced everywhere
- GDPR compliance: unsubscribe, data export, data deletion
- Audit log for all sensitive admin actions
- Webhook signature verification
- CSRF protection (via Next.js server actions / API headers)
- No PII leakage in logs

---

## Row Level Security (RLS)

RLS is the primary data isolation mechanism. Every table that holds workspace data must have RLS enabled and appropriate policies.

### RLS Audit Checklist
```sql
-- Verify RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- rowsecurity must be TRUE for all user-facing tables
```

### Critical RLS Rules
1. **Workspace isolation**: Users can only access rows where `workspace_id` matches their membership
2. **Role restrictions**: Mutations are gated by role (see `02-auth-and-roles.md`)
3. **Self-only access**: Reps can only modify leads assigned to them (for delete operations)
4. **Notifications**: Users can only read/update their own notifications
5. **Audit logs**: Read-only for all roles (no delete via application)

### Service Role Key
- The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS
- It must only be used in Edge Functions and API route handlers (server-side)
- NEVER expose to the browser or include in `NEXT_PUBLIC_` env vars
- Audit all usages before each release

---

## Supabase Vault (Credential Storage)

All third-party credentials are encrypted at rest using Supabase Vault:

### What Goes in Vault
| Secret | Description |
|---|---|
| `sending_account_{id}_resend_key` | Resend API key per sending account |
| `sending_account_{id}_smtp_pass` | SMTP password per sending account |
| `openai_api_key` | Workspace-level OpenAI key (if custom) |

### Access Pattern
```ts
// Write to Vault (server-side only)
const { data } = await supabase.rpc('vault.create_secret', {
  secret: rawApiKey,
  name: `sending_account_${accountId}_resend_key`
});
// Store data.id (vault secret ID) in sending_accounts table

// Read from Vault (server-side only, in Edge Function)
const { data } = await supabase.rpc('vault.decrypt_secret', {
  secret_id: account.resend_api_key_vault_id
});
const apiKey = data.decrypted_secret;
```

### Rules
- Raw credentials must NEVER be returned in any API response
- Vault IDs (not secrets) can be stored in the `sending_accounts` table
- All vault access is logged by Supabase internally

---

## API Route Security

### Authentication Check (Every Route)
```ts
// Standard pattern for all API routes
export async function POST(request: Request) {
  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const member = await getWorkspaceMember(user.id);
  if (!member || !member.is_active) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Role check
  if (!hasRole(member.role, 'manager')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  // ... proceed
}
```

### Input Validation (Zod)
```ts
// Every request body is validated with Zod before processing
const schema = z.object({
  email: z.string().email(),
  first_name: z.string().max(100).optional(),
  company: z.string().max(200).optional()
});

const parsed = schema.safeParse(await request.json());
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
}
```

### Rate Limiting
Applied via middleware or in API routes using an in-memory counter (or Upstash Redis for distributed):

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 10 req/min per IP |
| `POST /api/auth/signup` | 5 req/min per IP |
| `POST /api/ai/draft-email` | 20 req/min per workspace |
| `POST /api/emails/send` | 60 req/min per workspace |
| `POST /api/webhooks/*` | 1000 req/min (webhook volume) |

---

## Webhook Security

### Resend Webhook Verification
```ts
import { Webhook } from 'svix';

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const wh = new Webhook(webhookSecret);

  const headers = {
    'svix-id': request.headers.get('svix-id'),
    'svix-timestamp': request.headers.get('svix-timestamp'),
    'svix-signature': request.headers.get('svix-signature')
  };

  try {
    const payload = wh.verify(await request.text(), headers);
    // Process event
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
}
```

---

## Audit Log

### `audit_logs` Table
```sql
CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id),
  actor_id      uuid REFERENCES auth.users(id),
  action        text NOT NULL,
  resource_type text,
  resource_id   uuid,
  metadata      jsonb DEFAULT '{}',
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz DEFAULT now()
);

-- Read-only: no UPDATE or DELETE policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_audit_logs" ON audit_logs
  FOR SELECT USING (get_my_role(workspace_id) IN ('admin', 'super_admin'));
-- NO INSERT policy via RLS — inserts done via service role only
```

### Events to Audit Log
| Event | Who |
|---|---|
| Member invited | Admin |
| Member role changed | Admin |
| Member deactivated | Admin |
| Sending account added/removed | Admin |
| Campaign created/cancelled | Manager+ |
| Bulk lead delete | Manager+ |
| Data export requested | Any |
| Data deletion requested | Any |
| AI usage exceeded budget | System |
| Failed login attempts (> 3) | System |

### Audit Log Implementation
```ts
// Called from API routes (uses service role to bypass RLS)
async function auditLog(supabaseAdmin, {
  workspaceId, actorId, action, resourceType, resourceId, metadata, request
}) {
  await supabaseAdmin.from('audit_logs').insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata,
    ip_address: request.headers.get('x-forwarded-for'),
    user_agent: request.headers.get('user-agent')
  });
}
```

---

## GDPR Compliance

### Unsubscribe
- Every email includes an unsubscribe link
- Link hits `/unsubscribe?token=xxx` (public endpoint)
- Sets `leads.is_unsubscribed = true`, creates `unsubscribes` row
- Future emails to that address are blocked at API level
- Workspace-scoped: unsubscribing from one workspace does not affect others

### Data Export
```
GET /api/gdpr/export
```
- Returns ZIP containing:
  - lead data CSV (all fields)
  - email history CSV
  - activity log CSV
- Request logged to audit_log
- Only available to admin+ or the lead themselves (via token)

### Data Deletion
```
DELETE /api/gdpr/delete
```
- Soft-deletes all lead records for the workspace
- Hard-deletes PII from sending_accounts (credentials)
- Removes user from workspace_members
- Does not delete audit_log (legal retention requirement)
- Request logged to audit_log

### Data Retention Policy
- CSV uploads in Storage: auto-deleted after 30 days
- Activity logs: retained indefinitely (operational)
- Audit logs: retained indefinitely (legal)
- Emails table: retained indefinitely (operational analytics)
- Soft-deleted leads: hard-deleted after 90 days (scheduled via pg_cron)

---

## Content Security

### Email HTML Sanitisation
Before storing email body HTML, sanitise to prevent XSS:
```ts
import DOMPurify from 'isomorphic-dompurify';
const safeHtml = DOMPurify.sanitize(rawHtml, {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['href', 'style']
});
```

### SQL Injection Prevention
- All database queries use Supabase's parameterised query builder
- Never concatenate user input into raw SQL
- Zod validates all inputs before they touch the database

---

## Environment Variable Security

| Variable | Exposure | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Safe (anon access controlled by RLS) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Safe (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | NEVER in NEXT_PUBLIC_ |
| `OPENAI_API_KEY` | Server only | |
| `RESEND_API_KEY` | Server only | |
| `RESEND_WEBHOOK_SECRET` | Server only | |

---

## Implementation Order

1. Enable RLS on all tables (with initial restrictive policies)
2. Implement service role guard pattern in all API routes
3. Add Zod validation to all API request bodies
4. Create `audit_logs` table + `auditLog` utility
5. Wire audit logging to all sensitive operations
6. Implement Vault integration for sending account credentials
7. Implement rate limiting middleware
8. Implement webhook signature verification
9. Build unsubscribe page + endpoint
10. Build GDPR data export endpoint
11. Build GDPR data deletion endpoint
12. Run RLS policy audit (verify all tables)
13. Add HTML sanitisation to email compose flow

---

## Security Testing Checklist

- [ ] RLS audit: every table has rowsecurity = true
- [ ] Service role key not in any NEXT_PUBLIC_ variable
- [ ] Raw API keys never returned in any API response
- [ ] Zod validation rejects invalid inputs (fuzz test key endpoints)
- [ ] Rate limiting blocks excessive requests (test login brute force)
- [ ] Webhook endpoint rejects unverified requests
- [ ] Unsubscribe link works and blocks future emails
- [ ] Data export returns correct data for requesting workspace only
- [ ] Data deletion removes PII but retains audit log
- [ ] Audit log cannot be deleted via any application route
- [ ] HTML in email body is sanitised (XSS test)
- [ ] SMTP passwords not logged anywhere

---

## AI Model Guidance

- **No AI needed** for security implementation.
- Use Claude Sonnet only if generating complex RLS policy SQL from a natural language description (this is a legitimate use case for complex multi-condition policies).
- Do not use AI to auto-generate security-critical code without thorough review.
