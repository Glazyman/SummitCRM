/**
 * lib/ai/client.ts
 *
 * Singleton OpenAI client for server-side use only.
 * Never import this in client components.
 *
 * Key safety rules:
 *  - OPENAI_API_KEY is only accessed server-side (Next.js API routes, Server Actions)
 *  - Client throws a clear error if instantiated without a key
 *  - Exported as a lazy singleton to avoid duplicate instances
 */

import OpenAI from 'openai'

let _client: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (_client) return _client

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. ' +
      'Add it to .env.local to enable AI features.'
    )
  }

  _client = new OpenAI({
    apiKey,
    maxRetries: 2,
    timeout:    30_000,  // 30s — AI calls can be slow
  })

  return _client
}

// ── Feature flag check ────────────────────────────────────────────────────
/** Returns true if AI is enabled (env flag + key present). */
export function isAiEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_FEATURE_AI === 'true' &&
    !!process.env.OPENAI_API_KEY
  )
}
