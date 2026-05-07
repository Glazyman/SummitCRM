# 09 — AI Enrichment & Personalisation

## Goal
Use OpenAI to generate personalised emails, subject lines, and follow-up suggestions for individual leads and at campaign scale, while controlling token costs and never auto-triggering AI without user consent.

---

## Features

- Single-lead AI email draft generation
- Batch AI personalisation for campaigns
- Subject line generation
- Follow-up timing and content suggestions
- Tone selection: professional, casual, direct, friendly
- AI-generated email preview and approval before send
- Token usage tracking per workspace
- Monthly token budget alerts
- Caching: identical prompts return cached results

---

## AI Tasks & Model Selection

| Task | Model | Avg Tokens | When |
|---|---|---|---|
| Single email draft | `gpt-4o` | ~800 in / ~400 out | User clicks "AI Draft" on a lead |
| Batch email draft | `gpt-4o-mini` | ~600 in / ~350 out | Campaign with use_ai=true |
| Subject line only | `gpt-4o-mini` | ~300 in / ~50 out | Subject line helper in compose form |
| Follow-up suggestion | `gpt-4o-mini` | ~400 in / ~200 out | Follow-up assistant on lead detail |
| Lead summary | `gpt-4o-mini` | ~500 in / ~200 out | Enrichment sidebar on lead profile |

**Rule**: Use `gpt-4o` only when the user is making a single, high-quality interactive request. Use `gpt-4o-mini` for any background or batch processing where volume is high and quality slightly lower is acceptable.

---

## Database Tables

Primary: `ai_usage_logs`

```sql
-- Tracks all AI calls for cost visibility
ai_usage_logs (
  id, workspace_id, user_id,
  model, task, lead_id, campaign_id,
  prompt_tokens, completion_tokens, total_tokens, cost_usd,
  created_at
)
```

**AI draft storage**: Generated email drafts are stored temporarily in the `emails` table with `status='draft'` until user sends or discards.

---

## API Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/ai/draft-email` | Generate email draft for a lead | rep+ |
| POST | `/api/ai/subject-line` | Generate subject line options | rep+ |
| POST | `/api/ai/follow-up` | Suggest follow-up timing + content | rep+ |
| POST | `/api/ai/batch-personalise` | Start batch personalisation for campaign | manager+ |
| GET | `/api/ai/batch-personalise/[jobId]` | Poll batch job status | manager+ |
| GET | `/api/ai/usage` | Token usage summary for workspace | admin+ |

---

## Single Email Draft

### Request
```ts
// POST /api/ai/draft-email
{
  lead_id: "uuid",
  tone: "professional" | "casual" | "direct" | "friendly",
  context?: string,            // additional instructions from user
  template_hint?: string,      // optional base template to personalise
  sending_account_id: "uuid"   // used to populate sender details
}
```

### Server Logic
```ts
// 1. Fetch lead data
const lead = await getLead(lead_id);

// 2. Build prompt
const systemPrompt = `You are an expert cold outreach copywriter.
Write a personalised cold email in a ${tone} tone.
Keep it under 150 words. Be specific to the lead's company and role.
Do not use generic filler phrases. Be direct about the value proposition.
Output JSON: { subject: string, body_html: string, body_text: string }`;

const userPrompt = `Lead info:
- Name: ${lead.first_name} ${lead.last_name}
- Title: ${lead.title}
- Company: ${lead.company}
- Website: ${lead.website}
${context ? `\nAdditional context: ${context}` : ''}`;

// 3. Call OpenAI
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ],
  response_format: { type: 'json_object' },
  max_tokens: 600
});

// 4. Parse result
const draft = JSON.parse(response.choices[0].message.content);

// 5. Log token usage
await logAiUsage({
  workspace_id, user_id, model: 'gpt-4o',
  task: 'email_personalisation', lead_id,
  prompt_tokens: response.usage.prompt_tokens,
  completion_tokens: response.usage.completion_tokens
});

// 6. Return draft (not saved to DB yet — user must confirm send)
return { subject: draft.subject, body_html: draft.body_html };
```

---

## Subject Line Generation

### Request
```ts
// POST /api/ai/subject-line
{
  lead_id: "uuid",
  email_body?: string,   // optional: generate subject based on body
  count: 3               // number of options to return
}
```

### Prompt
```
Generate ${count} cold email subject lines for:
- Lead: ${first_name} at ${company}
- Title: ${title}
Return JSON: { subjects: string[] }
Keep each under 60 characters. No clickbait. No all-caps.
```

---

## Follow-Up Suggestion

### Request
```ts
// POST /api/ai/follow-up
{
  lead_id: "uuid"
}
```

### Server Logic
```ts
// Fetch recent activity for context
const recentActivity = await getLeadActivity(lead_id, { limit: 5 });

const prompt = `Based on this outreach history, suggest:
1. When to follow up (days from now)
2. A brief follow-up email draft

Activity history:
${recentActivity.map(a => `- ${a.type}: ${a.created_at}`).join('\n')}

Output JSON: {
  suggested_days: number,
  reason: string,
  subject: string,
  body_text: string
}`;
```

---

## Batch Personalisation

Used for campaigns with `use_ai = true` on a step.

### Flow
```
1. POST /api/ai/batch-personalise → creates background job
2. Edge Function picks up job (queued in DB or called directly)
3. For each lead in batch (in chunks of 10):
   a. Build prompt with lead data
   b. Call gpt-4o-mini (NOT gpt-4o — cost control)
   c. Store result in emails.body_html for that lead's campaign email
   d. Log usage to ai_usage_logs
   e. Update job progress
4. Mark job complete
5. Notify user
```

### Batching Strategy
- Process 10 leads per chunk
- 500ms delay between chunks (rate limit safety)
- Total job for 100 leads: ~50 seconds at gpt-4o-mini speeds
- Job status tracked in a `ai_batch_jobs` table or as JSONB on campaign row

### Cost Estimate
```
100 leads × 600 tokens avg = 60,000 tokens
gpt-4o-mini pricing: ~$0.60/1M input tokens
100 leads ≈ $0.04 total — acceptable
```

---

## Token Budget System

### Per-Workspace Monthly Cap
```sql
-- workspace_settings column: ai_monthly_token_budget (default: 1,000,000)
-- Current month usage:
SELECT SUM(total_tokens) FROM ai_usage_logs
WHERE workspace_id = $1
  AND created_at >= date_trunc('month', now());
```

### Budget Alerts
- At 80%: notify admins
- At 100%: block AI calls, show error: "Monthly AI token budget reached. Contact admin."

### Admin Usage Dashboard
- Total tokens this month, by model, by task, by user
- Estimated cost in USD
- Export CSV

---

## Caching Strategy

To avoid paying for identical AI calls:

```ts
// Generate a cache key from the prompt inputs
const cacheKey = crypto.createHash('sha256')
  .update(`${lead_id}:${tone}:${template_hint || ''}`)
  .digest('hex');

// Check cache (24hr TTL in ai_draft_cache table or Redis-equivalent)
const cached = await getCachedDraft(cacheKey);
if (cached) return cached;

// Call OpenAI
const draft = await callOpenAI(...);

// Store in cache
await cacheDraft(cacheKey, draft, { ttl: 24 * 60 * 60 });
```

---

## UI Components

### `<AIDraftModal>`
- Opens when user clicks "AI Draft" on lead detail
- Tone selector: Professional / Casual / Direct / Friendly
- Optional context textarea ("Additional instructions...")
- "Generate Draft" button → loading spinner
- Shows generated subject + body in editable fields
- "Regenerate" button for new version
- "Use This Draft" → pre-fills `<ComposeEmailModal>`
- Token usage shown: "~450 tokens used"

### `<SubjectLineHelper>`
- Inline component in `<ComposeEmailModal>`'s subject field
- "✨ AI Suggest" button → shows 3 subject line options
- Click to select one

### `<FollowUpSuggestionCard>`
- Shown in `<FollowUpModal>` after clicking "Suggest with AI"
- Displays: suggested timing, reason, draft content
- "Accept Suggestion" autofills follow-up fields

### `<BatchPersonalisationStatus>`
- Shown in Campaign builder Step 2 when `use_ai = true`
- Pre-launch: "AI will personalise for all X leads (est. cost: ~$0.04)"
- Post-launch: progress indicator during job execution

### `<AIUsageDashboard>` (Admin)
- Cards: Total tokens, Total cost, Calls this month
- Chart: tokens by day
- Table: breakdown by model, task, user

---

## Prompt Engineering Guidelines

1. **Always request JSON output** with explicit schema — use `response_format: { type: 'json_object' }`
2. **Set max_tokens** to prevent runaway completions
3. **Include negative instructions** ("Do not use generic phrases", "No clickbait")
4. **Provide specific lead data** — quality of output directly correlates to input richness
5. **System prompt sets persona and constraints** — user prompt provides data only
6. **Never include PII beyond what's needed** for the specific task

---

## Implementation Order

1. Set up OpenAI client in `lib/openai/client.ts`
2. Build `ai_usage_logs` table + logging utility
3. Build `POST /api/ai/draft-email` with gpt-4o
4. Build `<AIDraftModal>` component
5. Build `POST /api/ai/subject-line` with gpt-4o-mini
6. Build `<SubjectLineHelper>` in compose modal
7. Build `POST /api/ai/follow-up` with gpt-4o-mini
8. Build `<FollowUpSuggestionCard>` in follow-up modal
9. Build batch personalisation Edge Function
10. Build `POST /api/ai/batch-personalise` + polling endpoint
11. Build token budget system + alert logic
12. Build `<AIUsageDashboard>` for admins

---

## Testing Checklist

- [ ] AI draft generates valid JSON with subject + body_html
- [ ] Draft is not saved until user clicks "Use This Draft" → Send
- [ ] Token usage is logged accurately for each call
- [ ] gpt-4o used for single draft; gpt-4o-mini used for batch
- [ ] Batch personalisation processes all leads in campaign
- [ ] Batch job progress updates in real-time
- [ ] Token budget check blocks AI calls at 100% budget
- [ ] 80% budget alert is sent to workspace admins
- [ ] Cache returns result for identical prompt without calling OpenAI
- [ ] API key is never exposed to client (server-only)
- [ ] Failed OpenAI call returns graceful error (not 500)
- [ ] Follow-up suggestion includes timing + draft content

---

## When to Use Claude Sonnet (vs GPT)

- Use **Claude Sonnet** for: complex, reasoning-heavy tasks where prompt engineering is experimental or when GPT output quality is unsatisfactory
- Use **GPT-4o** for: production single-email personalisation (proven quality, good JSON adherence)
- Use **GPT-4o-mini** for: all batch, subject line, and follow-up tasks where cost per call matters
- Do NOT switch models mid-session unless there is a measurable quality reason to do so
