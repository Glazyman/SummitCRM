/**
 * lib/security/rate-limit.ts
 *
 * Sliding-window in-memory rate limiter for Next.js Edge/Node API routes.
 *
 * Uses a Map<key, { count, resetAt }> stored in module scope.
 * This is effective for single-region serverless (Vercel) — each instance
 * has its own counter and the windows reset independently.
 *
 * For multi-region or high-volume production use, swap the backing store
 * for Upstash Redis (`@upstash/ratelimit`) by replacing `getStore()` below.
 *
 * Usage:
 *   const { success, remaining, resetIn } = await rateLimit(req, 'auth', 10, 60_000)
 *   if (!success) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
 */

import { NextRequest, NextResponse } from 'next/server'

interface Entry {
  count:   number
  resetAt: number
}

// Module-level store — survives across requests in the same Lambda warm instance
const store = new Map<string, Entry>()

// Periodic cleanup to prevent unbounded memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 60_000)
}

export interface RateLimitResult {
  success:   boolean
  remaining: number
  resetIn:   number   // milliseconds until window resets
}

/**
 * Check and consume one token from the rate limiter.
 *
 * @param identifier  Unique key (e.g. IP, user ID, workspace ID)
 * @param prefix      Namespace for the rule (e.g. 'auth', 'ai', 'email')
 * @param limit       Maximum requests per window
 * @param windowMs    Window duration in milliseconds (default: 60 000 = 1 min)
 */
export function rateLimit(
  identifier: string,
  prefix:     string,
  limit:      number,
  windowMs:   number = 60_000,
): RateLimitResult {
  const key = `${prefix}:${identifier}`
  const now = Date.now()

  let entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs }
    store.set(key, entry)
  }

  entry.count++
  const remaining = Math.max(0, limit - entry.count)
  const resetIn   = Math.max(0, entry.resetAt - now)

  return {
    success:   entry.count <= limit,
    remaining,
    resetIn,
  }
}

/**
 * Extract a reliable rate-limit identifier from the request.
 * Prefers: user ID (if in header), then x-forwarded-for, then remote addr.
 */
export function getRateLimitKey(req: NextRequest, userId?: string): string {
  if (userId) return `user:${userId}`

  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return `ip:${forwarded.split(',')[0].trim()}`

  return `ip:unknown`
}

/**
 * Convenience: build a 429 response with standard rate-limit headers.
 */
export function rateLimitResponse(resetIn: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again shortly.' },
    {
      status: 429,
      headers: {
        'Retry-After':             String(Math.ceil(resetIn / 1000)),
        'X-RateLimit-Reset':       String(Date.now() + resetIn),
        'X-RateLimit-Limit':       '0',
        'X-RateLimit-Remaining':   '0',
      },
    }
  )
}

// ── Pre-configured rules ──────────────────────────────────────────────────

/** 10 auth attempts per IP per minute */
export const AUTH_LIMIT = { prefix: 'auth', limit: 10, windowMs: 60_000 } as const

/** 20 AI requests per workspace per minute */
export const AI_LIMIT   = { prefix: 'ai',   limit: 20, windowMs: 60_000 } as const

/** 60 email sends per workspace per minute */
export const EMAIL_LIMIT = { prefix: 'email', limit: 60, windowMs: 60_000 } as const

/** 5 signup attempts per IP per minute */
export const SIGNUP_LIMIT = { prefix: 'signup', limit: 5, windowMs: 60_000 } as const

/** 10 invite acceptances per IP per 5 minutes (unauthenticated token endpoint;
 *  generous enough for a team onboarding behind one office NAT) */
export const INVITE_ACCEPT_LIMIT = { prefix: 'invite-accept', limit: 10, windowMs: 300_000 } as const

/** 10 invite emails per admin per minute */
export const INVITE_SEND_LIMIT = { prefix: 'invite-send', limit: 10, windowMs: 60_000 } as const
