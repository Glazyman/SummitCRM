/**
 * lib/ai/usage.ts
 *
 * Cost calculation + usage logging for the snapshot-email task.
 * Writes to ai_usage_logs (migration 014). Lightweight — only the
 * snapshot task uses this; the wider AI feature set was removed.
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { AiModel, AiUsage } from './types'

// USD per 1M tokens (OpenAI list pricing as of 2026-05).
const PRICING: Record<AiModel, { input: number; output: number }> = {
  'gpt-4o':      { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output:  0.60 },
}

export function calcCostUsd(model: AiModel, promptTokens: number, completionTokens: number): number {
  const rates = PRICING[model]
  return (
    (promptTokens     / 1_000_000) * rates.input +
    (completionTokens / 1_000_000) * rates.output
  )
}

export interface LogUsageInput {
  workspace_id: string
  user_id:      string
  lead_id?:     string | null
  model:        AiModel
  task:         string  // 'snapshot_email'
  usage:        AiUsage
}

export async function logUsage(input: LogUsageInput): Promise<void> {
  try {
    const cost = calcCostUsd(input.model, input.usage.prompt, input.usage.completion)
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        insert: (rows: object) => Promise<{ error: { message: string; code?: string } | null; data: unknown }>
      }
    }
    // Schema note: matches the live `ai_usage_logs` table — no `cached`
    // column (the migration in repo declares it, but it's not in the
    // deployed schema; PostgREST rejects the insert if we send it).
    const row = {
      workspace_id:      input.workspace_id,
      user_id:           input.user_id,
      model:             input.model,
      task:              input.task,
      lead_id:           input.lead_id ?? null,
      campaign_id:       null,
      prompt_tokens:     input.usage.prompt,
      completion_tokens: input.usage.completion,
      total_tokens:      input.usage.total,
      cost_usd:          cost,
    }
    const { error } = await admin.from('ai_usage_logs').insert(row)
    if (error) {
      console.error('[ai-usage] insert returned error:', error, 'row:', row)
    } else {
      console.log('[ai-usage] inserted row', { task: row.task, total_tokens: row.total_tokens, cost_usd: cost })
    }
  } catch (err) {
    // Never block the user-facing flow on a logging failure.
    console.error('[ai-usage] logUsage threw:', err)
  }
}

// ── Read side ────────────────────────────────────────────────────────────
export interface UsageRow {
  id:                string
  created_at:        string
  user_id:           string
  user_name:         string | null
  lead_id:           string | null
  lead_company:      string | null
  model:             AiModel
  prompt_tokens:     number
  completion_tokens: number
  total_tokens:      number
  cost_usd:          number
}

export interface UsageSummary {
  month_total_calls:  number
  month_total_tokens: number
  month_total_usd:    number
  recent:             UsageRow[]
}
