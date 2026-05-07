/**
 * lib/ai/cache.ts
 *
 * Prompt result cache backed by the `ai_draft_cache` Supabase table.
 * TTL: 24 hours by default.
 *
 * Cache key = SHA-256 of (task + sorted inputs), so identical prompts
 * to the same lead never hit OpenAI twice within the TTL window.
 *
 * Two-layer approach:
 *   1. In-memory LRU (per-process, 100 entries) — zero latency for hot keys
 *   2. Supabase table — survives process restarts, shared across workers
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'

const CACHE_TTL_HOURS = 24
const MEM_CACHE_MAX   = 100

// ── In-memory LRU ─────────────────────────────────────────────────────────
const memCache = new Map<string, { value: unknown; expiresAt: number }>()

function memGet<T>(key: string): T | null {
  const entry = memCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { memCache.delete(key); return null }
  return entry.value as T
}

function memSet(key: string, value: unknown, ttlHours: number): void {
  if (memCache.size >= MEM_CACHE_MAX) {
    // Evict oldest entry
    const first = memCache.keys().next().value
    if (first) memCache.delete(first)
  }
  memCache.set(key, { value, expiresAt: Date.now() + ttlHours * 3_600_000 })
}

// ── Cache key generation ──────────────────────────────────────────────────
/**
 * Deterministic SHA-256 key from any combination of inputs.
 * Inputs are JSON-stringified and sorted to ensure order independence.
 */
export function makeCacheKey(inputs: Record<string, unknown>): string {
  const sorted = Object.keys(inputs).sort().reduce<Record<string, unknown>>((acc, k) => {
    acc[k] = inputs[k]
    return acc
  }, {})
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

// ── Get from cache ────────────────────────────────────────────────────────
export async function getCached<T>(key: string): Promise<T | null> {
  // 1. Check memory first
  const mem = memGet<T>(key)
  if (mem) return mem

  // 2. Check DB
  try {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('ai_draft_cache')
      .select('result, expires_at')
      .eq('cache_key', key)
      .gt('expires_at', new Date().toISOString())
      .single() as { data: { result: unknown; expires_at: string } | null }

    if (!data) return null

    const value = data.result as T
    memSet(key, value, CACHE_TTL_HOURS)
    return value
  } catch {
    return null
  }
}

// ── Store in cache ────────────────────────────────────────────────────────
export async function setCached(
  key:   string,
  value: unknown,
  ttlHours = CACHE_TTL_HOURS,
): Promise<void> {
  // Always set in memory
  memSet(key, value, ttlHours)

  // Persist to DB (upsert — handles race conditions)
  try {
    const adminClient = createAdminClient()
    const expiresAt   = new Date(Date.now() + ttlHours * 3_600_000).toISOString()
    await adminClient
      .from('ai_draft_cache')
      .upsert({ cache_key: key, result: value as never, expires_at: expiresAt })
  } catch (err) {
    // Non-fatal — cache miss on next request is acceptable
    console.warn('[ai-cache] DB write failed:', err)
  }
}

// ── Invalidate ────────────────────────────────────────────────────────────
export async function invalidateCache(key: string): Promise<void> {
  memCache.delete(key)
  try {
    const adminClient = createAdminClient()
    await adminClient.from('ai_draft_cache').delete().eq('cache_key', key)
  } catch {}
}

// ── Clean expired DB cache rows (called from cron) ────────────────────────
export async function cleanExpiredCache(): Promise<number> {
  try {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('ai_draft_cache')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('cache_key') as { data: Array<{ cache_key: string }> | null }
    return data?.length ?? 0
  } catch {
    return 0
  }
}
