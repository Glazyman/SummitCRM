/**
 * Shared types for the AI enrichment system.
 */

// ── Model identifiers ────────────────────────────────────────────────────
export type AiModel =
  | 'gpt-4o'
  | 'gpt-4o-mini'

/** Which model to use for each task.
 *  Rule: gpt-4o for interactive single requests; gpt-4o-mini for batch/background.
 */
export const TASK_MODELS: Record<AiTask, AiModel> = {
  email_draft:      'gpt-4o',       // interactive, high quality
  subject_line:     'gpt-4o-mini',  // fast, cheap
  follow_up:        'gpt-4o-mini',  // fast, cheap
  lead_summary:     'gpt-4o-mini',  // sidebar enrichment
  batch_email:      'gpt-4o-mini',  // cost control at scale
}

export type AiTask =
  | 'email_draft'
  | 'subject_line'
  | 'follow_up'
  | 'lead_summary'
  | 'batch_email'

export type AiTone = 'professional' | 'casual' | 'direct' | 'friendly'

// ── Cost per 1M tokens (USD) ─────────────────────────────────────────────
export const TOKEN_COST_PER_MILLION: Record<AiModel, { input: number; output: number }> = {
  'gpt-4o':      { input: 2.50,  output: 10.00 },
  'gpt-4o-mini': { input: 0.15,  output: 0.60  },
}

export function calcCostUsd(
  model: AiModel,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates = TOKEN_COST_PER_MILLION[model]
  return (
    (promptTokens    / 1_000_000) * rates.input +
    (completionTokens / 1_000_000) * rates.output
  )
}

// ── AI task payloads ──────────────────────────────────────────────────────

export interface DraftEmailRequest {
  lead_id:            string
  tone:               AiTone
  context?:           string
  template_hint?:     string
  sending_account_id: string
}

export interface DraftEmailResult {
  subject:    string
  body_html:  string
  body_text:  string
  tokens_used:number
  cached:     boolean
  model:      AiModel
}

export interface SubjectLineRequest {
  lead_id:    string
  email_body?: string
  count?:     number   // default 3
}

export interface SubjectLineResult {
  subjects:   string[]
  tokens_used:number
  cached:     boolean
}

export interface FollowUpRequest {
  lead_id: string
}

export interface FollowUpResult {
  suggested_days: number
  reason:         string
  subject:        string
  body_text:      string
  tokens_used:    number
  cached:         boolean
}

export interface LeadSummaryRequest {
  lead_id: string
}

export interface LeadSummaryResult {
  summary:     string
  key_facts:   string[]
  tokens_used: number
  cached:      boolean
}

export interface BatchPersonaliseRequest {
  campaign_id: string
  step_number: number
}

export interface BatchJob {
  id:          string
  campaign_id: string
  step_number: number
  status:      'pending' | 'running' | 'completed' | 'failed'
  total:       number
  processed:   number
  failed_count:number
  error?:      string
  created_at:  string
  updated_at:  string
}

// ── Usage / budget ────────────────────────────────────────────────────────

export interface AiUsageLog {
  id:                string
  workspace_id:      string
  user_id:           string
  model:             AiModel
  task:              AiTask
  lead_id?:          string
  campaign_id?:      string
  prompt_tokens:     number
  completion_tokens: number
  total_tokens:      number
  cost_usd:          number
  cached:            boolean
  created_at:        string
}

export interface UsageSummary {
  total_tokens:      number
  total_cost_usd:    number
  total_calls:       number
  budget:            number
  budget_used_pct:   number
  by_model:          Array<{ model: string; tokens: number; cost: number; calls: number }>
  by_task:           Array<{ task:  string; tokens: number; cost: number; calls: number }>
  by_day:            Array<{ date:  string; tokens: number; cost: number }>
}

// ── Budget warning thresholds ─────────────────────────────────────────────
export const BUDGET_WARNING_PCT   = 80
export const BUDGET_DEFAULT       = 1_000_000   // 1M tokens / month
