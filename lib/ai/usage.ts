/**
 * lib/ai/usage.ts
 *
 * Token usage logging, budget checking, and cost calculation.
 *
 * Every AI call MUST:
 *  1. Call checkBudget() BEFORE calling OpenAI
 *  2. Call logUsage() AFTER a successful call
 *
 * Budget rules:
 *  - Default: 1,000,000 tokens / workspace / month
 *  - At 80%: create a workspace notification
 *  - At 100%: block all AI calls until next month
 */

import { createAdminClient } from '@/lib/supabase/server'
import { calcCostUsd, BUDGET_DEFAULT, BUDGET_WARNING_PCT } from './types'
import type { AiModel, AiTask, AiUsageLog, UsageSummary } from './types'

// ── Log AI usage ──────────────────────────────────────────────────────────
export async function logUsage(params: {
  workspaceId:       string
  userId:            string
  model:             AiModel
  task:              AiTask
  leadId?:           string
  campaignId?:       string
  promptTokens:      number
  completionTokens:  number
  cached?:           boolean
}): Promise<void> {
  const {
    workspaceId, userId, model, task, leadId, campaignId,
    promptTokens, completionTokens, cached = false,
  } = params

  const totalTokens = promptTokens + completionTokens
  const costUsd     = cached ? 0 : calcCostUsd(model, promptTokens, completionTokens)

  try {
    const adminClient = createAdminClient()
    await adminClient.from('ai_usage_logs').insert({
      workspace_id:       workspaceId,
      user_id:            userId,
      model,
      task,
      lead_id:            leadId    ?? null,
      campaign_id:        campaignId ?? null,
      prompt_tokens:      promptTokens,
      completion_tokens:  completionTokens,
      total_tokens:       totalTokens,
      cost_usd:           costUsd,
      cached,
    })
  } catch (err) {
    // Non-fatal — usage logging failure must never break the AI call
    console.error('[ai-usage] logUsage failed:', err)
  }
}

// ── Check budget before AI call ───────────────────────────────────────────
export interface BudgetStatus {
  allowed:      boolean
  used:         number
  budget:       number
  used_pct:     number
  warning:      boolean   // true if >= 80%
}

export async function checkBudget(workspaceId: string): Promise<BudgetStatus> {
  try {
    const adminClient = createAdminClient()

    // Get workspace token budget (default 1M)
    const { data: ws } = await adminClient
      .from('workspace_settings')
      .select('ai_monthly_token_budget')
      .eq('workspace_id', workspaceId)
      .single() as { data: { ai_monthly_token_budget: number | null } | null }

    const budget = ws?.ai_monthly_token_budget ?? BUDGET_DEFAULT

    // Current month usage
    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1)
    startOfMonth.setUTCHours(0, 0, 0, 0)

    const { data: usageData } = await adminClient
      .from('ai_usage_logs')
      .select('total_tokens')
      .eq('workspace_id', workspaceId)
      .gte('created_at', startOfMonth.toISOString())
      .eq('cached', false) as { data: Array<{ total_tokens: number }> | null }

    const used     = (usageData ?? []).reduce((sum, r) => sum + r.total_tokens, 0)
    const usedPct  = budget > 0 ? Math.round((used / budget) * 100) : 0
    const allowed  = usedPct < 100
    const warning  = usedPct >= BUDGET_WARNING_PCT

    // Fire-and-forget: create budget warning notification if crossing 80% or 100%
    if (warning) {
      void createBudgetAlert(workspaceId, usedPct, budget)
    }

    return { allowed, used, budget, used_pct: usedPct, warning }
  } catch {
    // If budget check fails, allow the call (fail open for UX)
    return { allowed: true, used: 0, budget: BUDGET_DEFAULT, used_pct: 0, warning: false }
  }
}

async function createBudgetAlert(
  workspaceId: string,
  pct:         number,
  budget:      number,
): Promise<void> {
  try {
    const adminClient = createAdminClient()
    const level       = pct >= 100 ? 'critical' : 'warning'
    const title       = pct >= 100
      ? 'AI token budget reached'
      : 'AI token budget at 80%'
    const body = pct >= 100
      ? `Your workspace has used its monthly AI token budget (${budget.toLocaleString()} tokens). AI features are paused until next month.`
      : `Your workspace has used ${pct}% of its monthly AI token budget (${budget.toLocaleString()} tokens).`

    // Only create once per level per day
    const today = new Date().toISOString().slice(0, 10)
    const { count } = await adminClient
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('type', `ai_budget_${level}`)
      .gte('created_at', `${today}T00:00:00Z`) as { count: number | null }

    if ((count ?? 0) > 0) return

    await adminClient.from('notifications').insert({
      workspace_id: workspaceId,
      type:         `ai_budget_${level}`,
      title,
      body,
      is_read:      false,
    })
  } catch {}
}

// ── Get usage summary ─────────────────────────────────────────────────────
export async function getUsageSummary(
  workspaceId: string,
  months       = 1,
): Promise<UsageSummary> {
  const adminClient = createAdminClient()

  const startDate = new Date()
  startDate.setUTCMonth(startDate.getUTCMonth() - (months - 1))
  startDate.setUTCDate(1)
  startDate.setUTCHours(0, 0, 0, 0)

  const { data: rows } = await adminClient
    .from('ai_usage_logs')
    .select('model, task, total_tokens, cost_usd, created_at, cached')
    .eq('workspace_id', workspaceId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false }) as {
      data: Array<{
        model: string; task: string; total_tokens: number
        cost_usd: number; created_at: string; cached: boolean
      }> | null
    }

  const allRows  = rows ?? []
  const realRows = allRows.filter((r) => !r.cached)

  // Workspace budget
  const { data: ws } = await adminClient
    .from('workspace_settings')
    .select('ai_monthly_token_budget')
    .eq('workspace_id', workspaceId)
    .single() as { data: { ai_monthly_token_budget: number | null } | null }

  const budget = ws?.ai_monthly_token_budget ?? BUDGET_DEFAULT

  const totalTokens  = realRows.reduce((s, r) => s + r.total_tokens, 0)
  const totalCost    = realRows.reduce((s, r) => s + r.cost_usd, 0)
  const totalCalls   = realRows.length
  const budgetUsedPct = budget > 0 ? Math.round((totalTokens / budget) * 100) : 0

  // By model
  const modelMap = new Map<string, { tokens: number; cost: number; calls: number }>()
  for (const r of realRows) {
    const e = modelMap.get(r.model) ?? { tokens: 0, cost: 0, calls: 0 }
    e.tokens += r.total_tokens; e.cost += r.cost_usd; e.calls++
    modelMap.set(r.model, e)
  }

  // By task
  const taskMap = new Map<string, { tokens: number; cost: number; calls: number }>()
  for (const r of realRows) {
    const e = taskMap.get(r.task) ?? { tokens: 0, cost: 0, calls: 0 }
    e.tokens += r.total_tokens; e.cost += r.cost_usd; e.calls++
    taskMap.set(r.task, e)
  }

  // By day
  const dayMap = new Map<string, { tokens: number; cost: number }>()
  for (const r of realRows) {
    const day = r.created_at.slice(0, 10)
    const e   = dayMap.get(day) ?? { tokens: 0, cost: 0 }
    e.tokens += r.total_tokens; e.cost += r.cost_usd
    dayMap.set(day, e)
  }

  return {
    total_tokens:    totalTokens,
    total_cost_usd:  Math.round(totalCost * 10000) / 10000,
    total_calls:     totalCalls,
    budget,
    budget_used_pct: budgetUsedPct,
    by_model:  Array.from(modelMap.entries()).map(([model, v]) => ({ model, ...v })),
    by_task:   Array.from(taskMap.entries()).map(([task, v])  => ({ task,  ...v })),
    by_day:    Array.from(dayMap.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
  }
}
