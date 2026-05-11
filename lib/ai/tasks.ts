/**
 * lib/ai/tasks.ts
 *
 * Snapshot-email task: rewrite the intake answers into a Summit-Mergers
 * one-page company snapshot. Returns plain text body + a subject line.
 */

import { getOpenAIClient } from './client'
import { buildSnapshotPrompt } from './prompts'
import type { SnapshotPromptInput } from './prompts'
import type { AiUsage } from './types'

export interface SnapshotEmailResult {
  subject: string
  body:    string
  usage:   AiUsage
}

const MODEL       = 'gpt-4o'
const TEMPERATURE = 0.4
const MAX_TOKENS  = 1100

export async function generateSnapshotEmail(input: SnapshotPromptInput): Promise<SnapshotEmailResult> {
  const client = getOpenAIClient()
  const { system, user } = buildSnapshotPrompt(input)

  const response = await client.chat.completions.create({
    model:       MODEL,
    temperature: TEMPERATURE,
    max_tokens:  MAX_TOKENS,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user   },
    ],
  })

  const raw = response.choices[0]?.message?.content?.trim()
  if (!raw) throw new Error('OpenAI returned empty snapshot')

  // Some models like to wrap the whole thing in ``` even when told not to —
  // strip a single leading/trailing fence if present.
  const body = raw.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```\s*$/, '').trim()

  const company = (input.lead.company ?? '').trim()
  const subject = company ? `${company} – Snapshot` : 'Deal Snapshot'

  return {
    subject,
    body,
    usage: {
      prompt:     response.usage?.prompt_tokens     ?? 0,
      completion: response.usage?.completion_tokens ?? 0,
      total:      response.usage?.total_tokens      ?? 0,
    },
  }
}
