/**
 * lib/users-cache.ts
 *
 * Wraps `adminClient.auth.admin.listUsers()` with a 30-second in-memory
 * cache. Every page that needs to resolve user IDs to display names was
 * calling listUsers() on every request, which scans every user in the
 * Supabase project — fine at 5 users, slow at 1000+.
 *
 * With the cache, the slow scan happens once per 30 seconds per Node
 * process. Names rarely change, so 30s is a safe staleness window.
 */

import type { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

type CachedUser = {
  id:    string
  email: string | null | undefined
  user_metadata?: { full_name?: string }
}

const TTL_MS = 30_000

let cache: { users: CachedUser[]; expires: number } | null = null

/** Fetch all users in the Supabase project (cached for 30s). */
async function getAllUsers(adminClient: AdminClient): Promise<CachedUser[]> {
  const now = Date.now()
  if (cache && cache.expires > now) return cache.users

  const { data } = await (adminClient as unknown as {
    auth: { admin: { listUsers: () => Promise<{ data: { users: CachedUser[] } }> } }
  }).auth.admin.listUsers()

  cache = { users: data?.users ?? [], expires: now + TTL_MS }
  return cache.users
}

/**
 * Returns Map<userId, displayName> for the given member IDs only.
 * Display name preference: user_metadata.full_name → email → id.
 */
export async function getUsersById(
  adminClient: AdminClient,
  memberIds:   string[],
): Promise<Map<string, string>> {
  if (memberIds.length === 0) return new Map()
  const memberSet = new Set(memberIds)
  const users     = await getAllUsers(adminClient)
  return new Map(
    users
      .filter((u) => memberSet.has(u.id))
      .map((u) => [
        u.id,
        u.user_metadata?.full_name ?? u.email ?? u.id,
      ] as const),
  )
}

/**
 * Returns the full user objects for the given member IDs, in case the
 * caller needs more than just the display name (e.g. /api/team/* routes
 * that also want raw email).
 */
export async function getUsersByIdsFull(
  adminClient: AdminClient,
  memberIds:   string[],
): Promise<CachedUser[]> {
  if (memberIds.length === 0) return []
  const memberSet = new Set(memberIds)
  const users     = await getAllUsers(adminClient)
  return users.filter((u) => memberSet.has(u.id))
}

/** For routes that genuinely need the entire user table (rare). */
export async function getAllUsersCached(adminClient: AdminClient): Promise<CachedUser[]> {
  return getAllUsers(adminClient)
}

/** Find a user by email (case-insensitive). Returns null if not found. */
export async function findUserByEmail(
  adminClient: AdminClient,
  email:       string,
): Promise<CachedUser | null> {
  const lower = email.toLowerCase()
  const users = await getAllUsers(adminClient)
  return users.find((u) => u.email?.toLowerCase() === lower) ?? null
}

/** Force-refresh on next call. Useful after invite-accepted events. */
export function invalidateUsersCache(): void {
  cache = null
}
