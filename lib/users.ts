/**
 * lib/users.ts
 *
 * Thin wrappers over the get_users_by_ids / get_user_by_email RPCs.
 *
 * Replaces the prior lib/users-cache.ts that 30s-cached the entire
 * Supabase project listUsers() scan. The RPCs are workspace-scoped
 * (for getUsersById) and run inside Postgres — no full-account scans,
 * no cache to invalidate.
 *
 * Public API mirrors the old cache module so callsites only need to
 * change their import path.
 */

import type { createAdminClient } from '@/lib/supabase/server'

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

/**
 * Returns Map<userId, displayName> for the given member IDs.
 * Display name preference: user_metadata.full_name → email → id.
 */
export async function getUsersById(
  adminClient:  AdminClient,
  workspaceId:  string,
  memberIds:    string[],
): Promise<Map<string, string>> {
  if (memberIds.length === 0) return new Map()
  const { data, error } = await (adminClient as unknown as AdminWithRpc).rpc(
    'get_users_by_ids',
    { p_workspace_id: workspaceId, p_user_ids: memberIds },
  )
  if (error) throw new Error(`get_users_by_ids failed: ${error.message}`)
  const rows = (data ?? []) as RpcUserRow[]
  return new Map(rows.map((u) => [u.id, displayName(u)] as const))
}

/** Same as getUsersById but returns full CachedUser objects (email + metadata). */
export async function getUsersByIdsFull(
  adminClient:  AdminClient,
  workspaceId:  string,
  memberIds:    string[],
): Promise<CachedUser[]> {
  if (memberIds.length === 0) return []
  const { data, error } = await (adminClient as unknown as AdminWithRpc).rpc(
    'get_users_by_ids',
    { p_workspace_id: workspaceId, p_user_ids: memberIds },
  )
  if (error) throw new Error(`get_users_by_ids failed: ${error.message}`)
  return ((data ?? []) as RpcUserRow[]).map(toCachedUser)
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
