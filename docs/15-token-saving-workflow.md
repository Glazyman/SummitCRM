# 15 — Token-Saving Workflow

## Goal
Define patterns and rules to minimise OpenAI API token usage and cost without degrading the quality of AI features, ensuring the platform remains economically viable at scale.

---

## The Core Problem

AI features are the most expensive compute in this CRM. Without controls:
- A 500-lead campaign with AI personalisation = ~300,000 tokens = ~$0.30 (acceptable)
- But 10 campaigns/day × 500 leads × gpt-4o = ~$30/day (unacceptable)
- Context window bloat (including unnecessary data in prompts) multiplies costs

Every AI call should be treated as spending real money. This document defines the rules.

---

## Rule 1: Model Selection by Task

| Task | Correct Model | Wrong Model | Cost Difference |
|---|---|---|---|
| Single email draft (interactive) | `gpt-4o` | — | Baseline |
| Batch email draft (background) | `gpt-4o-mini` | `gpt-4o` | ~15x cheaper |
| Subject line suggestions | `gpt-4o-mini` | `gpt-4o` | ~15x cheaper |
| Follow-up suggestions | `gpt-4o-mini` | `gpt-4o` | ~15x cheaper |
| Lead summary | `gpt-4o-mini` | `gpt-4o` | ~15x cheaper |

**Decision rule**: Use `gpt-4o` only when the user is waiting for a single interactive result and quality difference is user-visible. Use `gpt-4o-mini` for everything else.

---

## Rule 2: Prompt Minimisation

Include only fields that meaningfully improve output quality. Do NOT include:

```ts
// BAD: Inflated prompt with irrelevant fields
const prompt = `
Lead name: ${lead.first_name} ${lead.last_name}
Email: ${lead.email}              // unnecessary — model doesn't need this
Phone: ${lead.phone}              // irrelevant for email copy
Source: ${lead.source}            // irrelevant
Import ID: ${lead.import_id}      // irrelevant
Created at: ${lead.created_at}    // irrelevant
Workspace ID: ${lead.workspace_id}// irrelevant + PII risk
`;

// GOOD: Only include what matters
const prompt = `
Name: ${lead.first_name} ${lead.last_name}
Title: ${lead.title || 'unknown'}
Company: ${lead.company || 'their company'}
Website: ${lead.website || ''}
`;
```

**Token savings per call**: 50–200 tokens
**At scale**: 500 leads × 150 saved tokens = 75,000 tokens saved per campaign

---

## Rule 3: Prompt Caching (Identical Inputs)

Cache AI results keyed on a deterministic hash of the prompt inputs. Serve cached result within 24 hours.

### Implementation

```ts
// /lib/ai/cache.ts
import { createHash } from 'crypto';

export function generateCacheKey(inputs: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(inputs))
    .digest('hex');
}

// Cache table in Postgres (or use Supabase KV if available)
// ai_draft_cache: { key, result_json, created_at }

export async function getCachedDraft(key: string, supabase) {
  const { data } = await supabase
    .from('ai_draft_cache')
    .select('result_json')
    .eq('cache_key', key)
    .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .single();
  return data?.result_json ?? null;
}
```

### When NOT to Cache
- When user explicitly clicks "Regenerate" (bypass cache)
- When lead data has been updated since last cache entry
- Follow-up suggestions (should always reflect latest activity)

---

## Rule 4: max_tokens Limits

Always set `max_tokens` to prevent runaway completions:

| Task | max_tokens |
|---|---|
| Email body (full draft) | 500 |
| Subject line (3 options) | 120 |
| Follow-up suggestion | 300 |
| Lead summary | 200 |
| Batch email draft | 450 |

Setting this prevents OpenAI from generating 2,000-token responses when 400 tokens would suffice.

---

## Rule 5: System Prompt Efficiency

The system prompt is sent with every request. Keep it tight.

```ts
// BAD: 400 tokens of system prompt
const systemPrompt = `
You are an expert in B2B SaaS sales outreach with 15 years of experience 
working at companies like Salesforce, HubSpot, and Outreach. You have 
written thousands of cold emails and understand the nuances of...
[continues for 300 more tokens]
`;

// GOOD: 80 tokens
const systemPrompt = `
Write a cold outreach email in a ${tone} tone. Max 120 words. 
Be specific, no filler phrases. 
Output JSON: { subject: string, body_html: string }
`;
```

**Savings**: 320 tokens × every call = significant at scale

---

## Rule 6: Batch Processing (Not One-by-One)

For campaigns with AI personalisation, never call OpenAI in a serial loop. Use chunked parallel processing with rate limit awareness:

```ts
// BAD: Serial processing (slow + no parallelism savings)
for (const lead of leads) {
  await callOpenAI(lead);  // 500 sequential calls
}

// GOOD: Chunked with controlled parallelism
const CHUNK_SIZE = 5;
const DELAY_MS = 200;  // Stay under rate limits

for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
  const chunk = leads.slice(i, i + CHUNK_SIZE);
  await Promise.all(chunk.map(lead => callOpenAI(lead)));
  if (i + CHUNK_SIZE < leads.length) {
    await sleep(DELAY_MS);
  }
}
```

**Benefits**:
- 5x throughput improvement
- Stays under OpenAI rate limits (TPM and RPM)
- Job completes in 1/5 the time

---

## Rule 7: Token Budget Enforcement

Per-workspace monthly token caps prevent runaway costs:

```ts
// Check budget before every AI call
export async function checkTokenBudget(workspaceId: string, estimatedTokens: number) {
  const { data } = await supabase.rpc('get_monthly_token_usage', {
    workspace_id: workspaceId
  });

  const { used, budget } = data;

  if (used + estimatedTokens > budget) {
    throw new Error('BUDGET_EXCEEDED');
  }

  if (used > budget * 0.8) {
    // Notify admins (once per day, deduped)
    await notifyTokenBudgetWarning(workspaceId, used, budget);
  }
}
```

### Default Budgets
| Workspace Size | Monthly Token Budget | Approx. Cost |
|---|---|---|
| Small (< 5 users) | 500,000 tokens | ~$0.50–$5 |
| Medium (5–20 users) | 2,000,000 tokens | ~$2–$20 |
| Large (20+ users) | 5,000,000 tokens | ~$5–$50 |

---

## Rule 8: Never Auto-Trigger AI

AI must only run when a user explicitly requests it. Never trigger AI automatically on:
- Lead import
- Lead status change
- Page load
- Background data refresh

This is both a cost and a UX principle: AI is a deliberate tool, not a background process.

**Valid AI triggers**:
- User clicks "AI Draft" button
- User clicks "Generate Subject Lines"
- User clicks "Suggest Follow-up"
- Campaign creator enables `use_ai = true` on a step

---

## Rule 9: Structured Output Only

Always use `response_format: { type: 'json_object' }` and explicitly define the schema in the prompt. Never parse free-text responses.

```ts
// BAD: Free text response — unpredictable, may be long, harder to parse
messages: [{ role: 'user', content: 'Write an email for...' }]

// GOOD: JSON response — predictable, compact, easy to parse
messages: [{ role: 'user', content: 'Write an email for... Output JSON: { subject, body_html }' }],
response_format: { type: 'json_object' }
```

Free-text responses often include preamble like "Sure! Here's a great email for you..." — pure token waste.

---

## Rule 10: Prompt Templates (Not Ad-Hoc Construction)

Maintain a library of tested, optimised prompt templates. Do not construct prompts ad-hoc in individual routes.

```ts
// /lib/ai/prompts.ts
export const PROMPTS = {
  emailDraft: (lead: Lead, tone: string, context?: string) => ({
    system: `Write a cold outreach email. Tone: ${tone}. Max 120 words. No filler. Output JSON: { subject: string, body_html: string }`,
    user: buildLeadContext(lead) + (context ? `\nContext: ${context}` : '')
  }),

  subjectLines: (lead: Lead, count: number) => ({
    system: `Generate ${count} subject lines. Under 60 chars each. No caps. Output JSON: { subjects: string[] }`,
    user: buildLeadContext(lead)
  }),

  followUp: (lead: Lead, activities: Activity[]) => ({
    system: `Suggest follow-up timing and draft. Output JSON: { days: number, reason: string, subject: string, body_text: string }`,
    user: buildLeadContext(lead) + '\nActivity:\n' + activities.map(a => `- ${a.type}: ${a.created_at}`).join('\n')
  })
};

function buildLeadContext(lead: Lead): string {
  // Minimal, optimised context — only populated fields
  const parts = [];
  if (lead.first_name) parts.push(`Name: ${lead.first_name} ${lead.last_name || ''}`);
  if (lead.title) parts.push(`Title: ${lead.title}`);
  if (lead.company) parts.push(`Company: ${lead.company}`);
  if (lead.website) parts.push(`Website: ${lead.website}`);
  return parts.join('\n');
}
```

---

## Token Cost Estimation Reference

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|
| `gpt-4o` | $2.50 | $10.00 |
| `gpt-4o-mini` | $0.15 | $0.60 |

### Per-Call Cost Examples

| Task | Model | In | Out | Cost |
|---|---|---|---|---|
| Single email draft | gpt-4o | 300 | 400 | $0.00475 |
| Batch email draft | gpt-4o-mini | 250 | 350 | $0.000248 |
| Subject lines (3) | gpt-4o-mini | 150 | 80 | $0.0000705 |
| Follow-up | gpt-4o-mini | 200 | 200 | $0.000150 |

### Scale Calculations

| Scenario | Cost |
|---|---|
| 100 leads, batch AI | ~$0.025 |
| 1,000 leads, batch AI | ~$0.25 |
| 50 single drafts/month | ~$0.24 |
| 200 subject line gen/month | ~$0.014 |
| **Typical small team/month** | **~$1–5** |

---

## AI Session Workflow for Developers

When implementing AI features, follow this sequence:

```
1. Define the task (what output is needed)
2. Select model (gpt-4o-mini unless interactive + quality-critical)
3. Write prompt from PROMPTS template library
4. Set max_tokens
5. Add cache check (skip if force-regenerate)
6. Check token budget before calling
7. Call OpenAI with json_object response_format
8. Parse + validate response with Zod
9. Log token usage to ai_usage_logs
10. Return result to user (never save without user confirmation)
```

---

## When to Use Claude Sonnet

Use Claude Sonnet (or Claude models via Anthropic API) instead of GPT:

| Situation | Recommendation |
|---|---|
| GPT-4o output quality is insufficient for a task | Test Claude Sonnet as alternative |
| Complex reasoning required (e.g., lead scoring from unstructured data) | Claude Sonnet may outperform |
| Generating code or SQL | Claude Sonnet is competitive |
| High-volume batch tasks | Stick with gpt-4o-mini (more predictable cost) |
| Interactive, single-call drafting | Try both, pick based on quality |

**Important**: Do not use multiple AI providers without a clear reason. Standardise on OpenAI for production and only switch if there is a measurable quality or cost benefit.

---

## Monthly AI Cost Monitoring

Add this query to the admin dashboard's AI usage section:

```sql
-- Current month token usage and cost by model
SELECT
  model,
  task,
  COUNT(*) AS calls,
  SUM(total_tokens) AS total_tokens,
  SUM(cost_usd) AS total_cost_usd
FROM ai_usage_logs
WHERE workspace_id = $1
  AND created_at >= date_trunc('month', now())
GROUP BY model, task
ORDER BY total_cost_usd DESC;
```

---

## Summary Checklist

- [ ] All batch tasks use `gpt-4o-mini`
- [ ] All prompts built from `PROMPTS` template library
- [ ] All calls have `max_tokens` set
- [ ] All calls use `response_format: { type: 'json_object' }`
- [ ] System prompts are under 100 tokens
- [ ] Prompt inputs include only necessary lead fields
- [ ] Cache layer implemented with 24h TTL
- [ ] Token budget check runs before every AI call
- [ ] Budget warning notification fires at 80%
- [ ] Budget hard stop fires at 100%
- [ ] AI never auto-triggered without user action
- [ ] Token usage logged for every call
- [ ] Admin can view monthly cost breakdown
