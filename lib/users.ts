/**
 * lib/users.ts
 *
 * Thin wrappers over the get_users_by_ids / get_user_by_email RPCs.
 *
 * Replaces the prior lib/users-cache.ts that 30s-cached the entire
 * Supabase project listUsers() scan. The RPCs are workspace-scoped
 * (for getUsersById) and run inside Postgres — no full-account scans,
 * display metadata cached for 60 seconds; authorization is verified separately.
 *
 * Public API mirrors the old cache module so callsites only need to
 * change their import path.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'

type AdminClient = ReturnType<typeof createAdminClient>

export type CachedUser = {
  id:    string
  email: string | null | undefined
  user_metadata?: { full_name?: string }
}

type RpcUserRow = {
  id:        string
  email:     string | null
  full_name: string | null
}

type AdminWithRpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown
    error: { message: string } | null
  }>
}

function displayName(u: { full_name: string | null; email: string | null; id: string }): string {
  return u.full_name ?? u.email ?? u.id
}

function toCachedUser(u: RpcUserRow): CachedUser {
  return {
    id:    u.id,
    email: u.email,
    user_metadata: u.full_name ? { full_name: u.full_name } : undefined,
  }
}

// Cache display metadata only. Membership/role checks stay live in getActor().
// Explicit workspace + sorted IDs prevent cross-workspace cache collisions.
const getDisplayUsers = unstable_cache(async (workspaceId: string, memberIds: string[]): Promise<RpcUserRow[]> => {
  const admin = createAdminClient()
  const { data, error } = await (admin as unknown as AdminWithRpc).rpc('get_users_by_ids', {
    p_workspace_id: workspaceId, p_user_ids: memberIds,
  })
  if (error) throw new Error(`get_users_by_ids failed: ${error.message}`)
  return (data ?? []) as RpcUserRow[]
}, ['workspace-display-users-v1'], { revalidate: 60 })

/**
 * Returns Map<userId, displayName> for the given member IDs.
 * Display name preference: user_metadata.full_name → email → id.
 */
export async function getUsersById(
  _adminClient: AdminClient,
  workspaceId:  string,
  memberIds:    string[],
): Promise<Map<string, string>> {
  if (memberIds.length === 0) return new Map()
  const rows = await getDisplayUsers(workspaceId, [...new Set(memberIds)].sort())
  return new Map(rows.map((u) => [u.id, displayName(u)] as const))
}

/** Same as getUsersById but returns full CachedUser objects (email + metadata). */
export async function getUsersByIdsFull(
  _adminClient: AdminClient,
  workspaceId:  string,
  memberIds:    string[],
): Promise<CachedUser[]> {
  if (memberIds.length === 0) return []
  const rows = await getDisplayUsers(workspaceId, [...new Set(memberIds)].sort())
  return rows.map(toCachedUser)
}

/** Find a user by email (case-insensitive). Returns null if not found. Service-role only. */
export async function findUserByEmail(
  adminClient: AdminClient,
  email:       string,
): Promise<(CachedUser & { email_confirmed_at?: string | null }) | null> {
  const { data, error } = await (adminClient as unknown as AdminWithRpc).rpc(
    'get_user_by_email',
    { p_email: email },
  )
  if (error) throw new Error(`get_user_by_email failed: ${error.message}`)
  if (!data || typeof data !== 'object') return null
  const row = data as RpcUserRow & { email_confirmed_at: string | null }
  if (!row.id) return null
  return {
    ...toCachedUser(row),
    email_confirmed_at: row.email_confirmed_at,
  }
}
