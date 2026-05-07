# 14 — Testing Plan

## Goal
Define the testing strategy, tools, coverage targets, and test cases to ensure the application is reliable before launch and regression-safe during ongoing development.

---

## Testing Stack

| Type | Tool | Scope |
|---|---|---|
| Unit tests | Vitest | Pure functions, utilities, validation |
| Component tests | Vitest + React Testing Library | UI components |
| Integration tests | Vitest + Supabase local | API routes + DB logic |
| End-to-End (E2E) | Playwright | Critical user flows |
| Database tests | pgTAP (optional) | RLS policies, SQL functions |
| API contract | Zod schema tests | Request/response validation |
| Performance | k6 or Artillery | Email queue load test |

---

## Coverage Targets

| Layer | Target |
|---|---|
| Utility functions (`/lib`) | 90%+ |
| API routes | 80%+ |
| UI components (critical) | 70%+ |
| E2E critical paths | 100% of P0 flows |

---

## Unit Tests

### Location
`/tests/unit/` or co-located `*.test.ts` files

### What to Test

**Email utilities** (`lib/email/`):
- `mergeTags(template, lead)` — correct variable substitution
- `buildTrackingUrl(emailId, originalUrl)` — correct URL encoding
- `validateEmail(string)` — valid/invalid email formats
- `calculateScheduledFor(campaignStart, delayDays)` — date math
- `sanitizeHtml(html)` — XSS vectors are stripped

**Quota utilities** (`lib/quota/`):
- `hasQuotaRemaining(account)` — true/false at 0, 49, 50
- `getRemainingQuota(account)` — correct subtraction
- `isQuotaWarning(account)` — true at >= 40, false at < 40

**AI utilities** (`lib/ai/`):
- `buildEmailPrompt(lead, tone, context)` — correct prompt structure
- `parseAIEmailResponse(json)` — handles valid/invalid JSON from OpenAI
- `estimateTokenCost(tokens, model)` — correct cost calculation

**Validation schemas** (Zod):
- Lead import field mapping schema
- Campaign creation schema
- Sending account schema (Resend vs SMTP branches)

---

## Component Tests

### Location
`/tests/components/` or co-located `*.test.tsx`

### Critical Components to Test

**`<RoleGate>`**:
- Renders children when role is sufficient
- Hides children when role is insufficient
- Works for all 5 role levels

**`<LeadStatusBadge>`**:
- Renders correct colour for each status
- Fires onChange callback when status selected

**`<ImportWizard>`**:
- Progresses through steps on valid input
- Shows validation errors on invalid CSV
- Disables Next on missing required field mapping

**`<QuotaStatusBadge>`**:
- Green at < 80%
- Yellow at 80–99%
- Red at 100%

**`<ComposeEmailModal>`**:
- Merge variable preview renders correctly
- Send button disabled if no from account selected
- Character count updates on input

---

## Integration Tests

### Location
`/tests/integration/`

### Setup
```ts
// Use Supabase local dev instance for integration tests
// Reset DB to known state before each test suite
beforeAll(async () => {
  await resetDatabase(); // truncate test workspace tables
  await seedTestWorkspace();
});
```

### API Routes to Test

**Auth Routes**:
- `POST /api/auth/signup` — creates user + workspace
- `POST /api/auth/invite` — creates invitation record + sends email
- `POST /api/auth/accept-invite` — joins workspace with correct role

**Lead Routes**:
- `GET /api/leads` — returns paginated leads for workspace (not others)
- `POST /api/leads` — creates lead with correct workspace_id
- `PATCH /api/leads/bulk` — updates all specified leads
- `DELETE /api/leads/[id]` — soft-deletes (rep cannot delete)

**Email Routes**:
- `POST /api/emails/send` — creates email + queue entry
- `POST /api/emails/send` — returns 400 for unsubscribed lead
- `POST /api/emails/send` — returns 429 when quota exceeded
- `GET /api/track/open/[pixelId]` — updates email status

**Campaign Routes**:
- `POST /api/campaigns` — creates campaign + steps
- `POST /api/campaigns/[id]/start` — creates email rows for all leads
- `POST /api/campaigns/[id]/pause` — stops queue processing

**AI Routes**:
- `POST /api/ai/draft-email` — returns valid subject + body
- Token usage is logged after successful call
- Returns 429 when workspace token budget exceeded

---

## End-to-End Tests (Playwright)

### Location
`/tests/e2e/`

### Environment
- Runs against staging Supabase project
- Uses dedicated test workspace (seeded before run)
- Resets test workspace after each spec

### Critical E2E Flows

**Flow 1: Onboarding**
```
1. Visit /signup
2. Enter email + password + workspace name
3. Verify redirect to /dashboard
4. Verify workspace name shown in nav
```

**Flow 2: Lead Import**
```
1. Navigate to /leads
2. Click "Import Leads"
3. Upload valid CSV (50 rows)
4. Map fields (email, first_name, company)
5. Assign to new batch "Test Batch"
6. Click Import
7. Wait for completion
8. Verify 50 leads appear in lead list
9. Verify batch created with correct name
```

**Flow 3: Send Individual Email**
```
1. Open lead detail page
2. Click "Send Email"
3. Select sending account
4. Fill in subject + body
5. Click Send
6. Verify email row created (status: sent)
7. Verify activity log entry
8. Verify quota incremented by 1
```

**Flow 4: Create & Start Campaign**
```
1. Navigate to /campaigns
2. Click "New Campaign"
3. Fill in name, select batch, select sending account
4. Add Step 1 with subject + body template
5. Add Step 2 with 3-day delay
6. Preview email for a sample lead
7. Click Launch
8. Verify campaign status = running
9. Verify email rows created for all leads in batch
```

**Flow 5: Team Invite**
```
1. Admin navigates to /settings/team
2. Click "Invite Member"
3. Enter email + select role "rep"
4. Click Send Invite
5. Verify invitation email received (or invitation record created)
6. Accept invite via token URL
7. Verify new member in team list with correct role
```

**Flow 6: Notification Flow**
```
1. Send email to test lead
2. Trigger mock open event (call tracking pixel)
3. Verify notification NOT created (open events do not notify)
4. Trigger mock reply event (call webhook)
5. Verify notification appears in bell (< 3 seconds)
6. Click notification
7. Verify navigates to correct lead
8. Verify notification marked as read
```

**Flow 7: Role Restrictions**
```
1. Log in as rep
2. Verify "New Campaign" button not visible
3. Navigate directly to /campaigns/new
4. Verify 403 response
5. Verify bulk delete button not visible in lead list
6. Attempt DELETE /api/leads/bulk via API
7. Verify 403 response
```

---

## RLS Policy Tests

Test directly against Supabase local dev:

```sql
-- Test: user cannot see leads from another workspace
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "user-b-uuid"}';
SELECT COUNT(*) FROM leads WHERE workspace_id = 'workspace-a-uuid';
-- Expected: 0
```

Each table should have:
- Positive test: member can read own workspace data
- Negative test: member cannot read other workspace data
- Role test: rep cannot delete, viewer cannot insert

---

## Performance Tests

### Email Queue Load Test (k6)
```
Scenario: 500 leads in campaign, 50/day limit per account
Target: Queue processor handles 50 emails per 2-min run without errors
Checks:
- All 50 emails marked 'sent' within 120 seconds
- No duplicate sends (idempotency)
- Sending account quota incremented exactly 50 times
```

### Lead List Performance
```
Scenario: Workspace with 10,000 leads
Target: GET /api/leads?page=1 responds in < 500ms
```

### CSV Import Performance
```
Scenario: 10,000 row CSV import
Target: Completes in < 60 seconds
No memory errors in Edge Function
```

---

## Test Data & Seeding

```ts
// /tests/fixtures/seed.ts
export async function seedTestWorkspace() {
  // Create workspace
  const workspace = await createWorkspace('Test Corp');
  // Create admin + rep users
  const admin = await createUser('admin@test.com', 'admin');
  const rep = await createUser('rep@test.com', 'rep');
  // Create sending account (mock Resend)
  const account = await createSendingAccount(workspace.id, { type: 'resend' });
  // Create batch with 20 leads
  const batch = await createBatch(workspace.id, 'Test Batch');
  const leads = await createLeads(workspace.id, batch.id, 20);
  return { workspace, admin, rep, account, batch, leads };
}
```

---

## CI/CD Integration

```yaml
# .github/workflows/test.yml
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit

  integration:
    runs-on: ubuntu-latest
    services:
      supabase:
        image: supabase/postgres:15
    steps:
      - run: npm run test:integration

  e2e:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/staging'
    steps:
      - run: npx playwright install
      - run: npm run test:e2e
```

---

## Testing Checklist (Pre-Launch)

### Unit Tests
- [ ] All email utility functions tested
- [ ] Quota logic functions tested
- [ ] AI prompt builders tested
- [ ] All Zod schemas tested with valid + invalid inputs

### Component Tests
- [ ] `<RoleGate>` all role combinations
- [ ] `<ImportWizard>` full flow
- [ ] `<ComposeEmailModal>` merge variable preview
- [ ] `<NotificationBell>` unread count updates

### Integration Tests
- [ ] All critical API routes have at least one happy-path test
- [ ] All API routes have auth/permission tests
- [ ] Quota enforcement tested end-to-end
- [ ] Unsubscribe blocks email send

### E2E Tests
- [ ] All 7 critical flows pass on staging
- [ ] No flaky tests (run 3x before marking stable)

### RLS Tests
- [ ] Cross-workspace isolation verified for all tables
- [ ] Role-based mutation restrictions verified

### Performance Tests
- [ ] 10,000 lead list loads in < 500ms
- [ ] 500-lead campaign queue processes without errors
- [ ] 10,000 row CSV import completes in < 60s

---

## AI Model Guidance

- **No AI needed** for writing test infrastructure or running tests.
- **GPT-4o-mini** can be used to generate test case descriptions or test data fixtures from schema definitions (low-cost, occasional use).
- Use Claude Sonnet to help design complex test scenarios (e.g., RLS policy test matrices) where reasoning about security is required.
