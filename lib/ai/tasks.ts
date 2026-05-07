/**
 * lib/ai/tasks.ts
 *
 * Modular AI task executors — one function per task type.
 * Each function:
 *   1. Checks cache → returns cached result if available
 *   2. Validates inputs
 *   3. Calls OpenAI with the correct model + JSON response format
 *   4. Parses + validates the response
 *   5. Stores in cache
 *   6. Returns typed result
 *
 * Usage logging is handled by the calling API route (keeps these pure).
 */

import { getOpenAIClient } from './client'
import { makeCacheKey, getCached, setCached } from './cache'
import {
  buildEmailDraftPrompt, buildSubjectLinePrompt,
  buildFollowUpPrompt, buildLeadSummaryPrompt, buildBatchEmailPrompt,
} from './prompts'
import { TASK_MODELS } from './types'
import type {
  DraftEmailResult, SubjectLineResult, FollowUpResult,
  LeadSummaryResult, AiTone,
} from './types'
import type { LeadPromptData, SenderPromptData } from './prompts'

// ── Shared OpenAI JSON call ───────────────────────────────────────────────
async function callOpenAI<T>(params: {
  model:     string
  system:    string
  user:      string
  maxTokens: number
}): Promise<{ result: T; usage: { prompt: number; completion: number; total: number } }> {
  const client   = getOpenAIClient()
  const response = await client.chat.completions.create({
    model:           params.model,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user',   content: params.user   },
    ],
    response_format: { type: 'json_object' },
    max_tokens:      params.maxTokens,
    temperature:     0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('OpenAI returned empty response')

  let parsed: T
  try {
    parsed = JSON.parse(content) as T
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${content.slice(0, 200)}`)
  }

  return {
    result: parsed,
    usage:  {
      prompt:     response.usage?.prompt_tokens     ?? 0,
      completion: response.usage?.completion_tokens ?? 0,
      total:      response.usage?.total_tokens      ?? 0,
    },
  }
}

// ── 1. Single email draft ─────────────────────────────────────────────────
export async function generateEmailDraft(params: {
  lead:          LeadPromptData
  sender:        SenderPromptData
  tone:          AiTone
  templateHint?: string
  context?:      string
}): Promise<DraftEmailResult & { usage: { prompt: number; completion: number } }> {
  const { lead, sender, tone, templateHint = '', context = '' } = params

  // Cache key includes lead identity + tone + template hint
  const cacheKey = makeCacheKey({
    task:  'email_draft',
    email: lead.email,
    tone,
    hint:  templateHint.slice(0, 100),
    ctx:   context.slice(0, 100),
  })

  const cached = await getCached<DraftEmailResult>(cacheKey)
  if (cached) {
    return { ...cached, cached: true, usage: { prompt: 0, completion: 0 } }
  }

  const { system, user } = buildEmailDraftPrompt(lead, sender, tone, templateHint, context)

  const { result, usage } = await callOpenAI<{
    subject: string; body_html: string; body_text: string
  }>({
    model:     TASK_MODELS.email_draft,
    system,
    user,
    maxTokens: 600,
  })

  // Validate required fields
  if (!result.subject || !result.body_html) {
    throw new Error('AI response missing required fields: subject, body_html')
  }

  const output: DraftEmailResult = {
    subject:     result.subject.trim(),
    body_html:   result.body_html.trim(),
    body_text:   result.body_text?.trim() ?? result.body_html.replace(/<[^>]+>/g, ''),
    tokens_used: usage.total,
    cached:      false,
    model:       TASK_MODELS.email_draft,
  }

  await setCached(cacheKey, output)
  return { ...output, usage: { prompt: usage.prompt, completion: usage.completion } }
}

// ── 2. Subject line generation ────────────────────────────────────────────
export async function generateSubjectLines(params: {
  lead:       LeadPromptData
  emailBody?: string
  count?:     number
}): Promise<SubjectLineResult & { usage: { prompt: number; completion: number } }> {
  const { lead, emailBody = '', count = 3 } = params

  const cacheKey = makeCacheKey({
    task:  'subject_line',
    email: lead.email,
    count,
    body:  emailBody.slice(0, 150),
  })

  const cached = await getCached<SubjectLineResult>(cacheKey)
  if (cached) {
    return { ...cached, cached: true, usage: { prompt: 0, completion: 0 } }
  }

  const { system, user } = buildSubjectLinePrompt(lead, emailBody, count)

  const { result, usage } = await callOpenAI<{ subjects: string[] }>({
    model:     TASK_MODELS.subject_line,
    system,
    user,
    maxTokens: 200,
  })

  if (!Array.isArray(result.subjects) || result.subjects.length === 0) {
    throw new Error('AI returned no subject lines')
  }

  const output: SubjectLineResult = {
    subjects:    result.subjects.slice(0, count).map((s) => String(s).trim()),
    tokens_used: usage.total,
    cached:      false,
  }

  await setCached(cacheKey, output, 6)  // 6-hour TTL for subject lines
  return { ...output, usage: { prompt: usage.prompt, completion: usage.completion } }
}

// ── 3. Follow-up suggestion ───────────────────────────────────────────────
export async function generateFollowUp(params: {
  lead:            LeadPromptData
  activityHistory: string
}): Promise<FollowUpResult & { usage: { prompt: number; completion: number } }> {
  const { lead, activityHistory } = params

  const cacheKey = makeCacheKey({
    task:     'follow_up',
    email:    lead.email,
    activity: activityHistory.slice(0, 200),
  })

  const cached = await getCached<FollowUpResult>(cacheKey)
  if (cached) {
    return { ...cached, cached: true, usage: { prompt: 0, completion: 0 } }
  }

  const { system, user } = buildFollowUpPrompt(lead, activityHistory)

  const { result, usage } = await callOpenAI<{
    suggested_days: number; reason: string; subject: string; body_text: string
  }>({
    model:     TASK_MODELS.follow_up,
    system,
    user,
    maxTokens: 400,
  })

  const output: FollowUpResult = {
    suggested_days: typeof result.suggested_days === 'number' ? result.suggested_days : 3,
    reason:         result.reason  ?? '',
    subject:        result.subject ?? 'Following up',
    body_text:      result.body_text ?? '',
    tokens_used:    usage.total,
    cached:         false,
  }

  await setCached(cacheKey, output, 2)  // 2-hour TTL (context changes often)
  return { ...output, usage: { prompt: usage.prompt, completion: usage.completion } }
}

// ── 4. Lead summary ───────────────────────────────────────────────────────
export async function generateLeadSummary(params: {
  lead: LeadPromptData
}): Promise<LeadSummaryResult & { usage: { prompt: number; completion: number } }> {
  const { lead } = params

  const cacheKey = makeCacheKey({
    task:    'lead_summary',
    email:   lead.email,
    company: lead.company ?? '',
    title:   lead.title   ?? '',
  })

  const cached = await getCached<LeadSummaryResult>(cacheKey)
  if (cached) {
    return { ...cached, cached: true, usage: { prompt: 0, completion: 0 } }
  }

  const { system, user } = buildLeadSummaryPrompt(lead)

  const { result, usage } = await callOpenAI<{
    summary: string; key_facts: string[]
  }>({
    model:     TASK_MODELS.lead_summary,
    system,
    user,
    maxTokens: 350,
  })

  const output: LeadSummaryResult = {
    summary:     result.summary   ?? '',
    key_facts:   Array.isArray(result.key_facts) ? result.key_facts.map(String) : [],
    tokens_used: usage.total,
    cached:      false,
  }

  await setCached(cacheKey, output, 48)  // 48-hour TTL (lead data rarely changes)
  return { ...output, usage: { prompt: usage.prompt, completion: usage.completion } }
}

// ── 5. Batch personalise one lead ─────────────────────────────────────────
/** Called per-lead inside the batch Edge Function. Uses gpt-4o-mini. */
export async function generateBatchEmail(params: {
  lead:          LeadPromptData
  sender:        SenderPromptData
  tone:          AiTone
  templateHint?: string
}): Promise<{
  subject: string; body_html: string; body_text: string
  usage: { prompt: number; completion: number }
  cached: boolean
}> {
  const { lead, sender, tone, templateHint = '' } = params

  const cacheKey = makeCacheKey({
    task:  'batch_email',
    email: lead.email,
    tone,
    hint:  templateHint.slice(0, 80),
  })

  const cached = await getCached<{ subject: string; body_html: string; body_text: string }>(cacheKey)
  if (cached) {
    return { ...cached, usage: { prompt: 0, completion: 0 }, cached: true }
  }

  const { system, user } = buildBatchEmailPrompt(lead, sender, tone, templateHint)

  const { result, usage } = await callOpenAI<{
    subject: string; body_html: string; body_text: string
  }>({
    model:     TASK_MODELS.batch_email,
    system,
    user,
    maxTokens: 450,
  })

  const output = {
    subject:   result.subject?.trim()   ?? '',
    body_html: result.body_html?.trim() ?? '',
    body_text: result.body_text?.trim() ?? '',
  }

  await setCached(cacheKey, output, 24)
  return { ...output, usage: { prompt: usage.prompt, completion: usage.completion }, cached: false }
}
