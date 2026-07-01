import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/utils/roles'
import type { WorkspaceRole } from '@/types/database'

/**
 * Cookie holding the user_id an admin is currently "viewing as".
 * Server-authoritative: it is only ever honoured when getActor() re-verifies
 * (every request) that the REAL caller is an admin and the target is an active
 * member of the same workspace. It is never a security boundary on its own.
 */
export const VIEW_AS_COOKIE = 'summit_view_as'

/**
 * The identity a request should act as.
 *
 * When an admin is impersonating ("view as") another teammate, `userId`/`role`
 * are the *effective* (impersonated) identity — use these for data scoping and
 * for stamping who performed a write. `realUserId`/`realRole` are always the
 * authenticated admin — use these for anything that must not be spoofable
 * (e.g. deciding who is allowed to start/stop impersonation).
 */
export interface Actor {
  /** Effective user id — the impersonated teammate when viewing-as, else the real user. */
  userId: string
  workspaceId: string
  /** Effective role — the impersonated teammate's role when viewing-as. */
  role: WorkspaceRole
  /** The authenticated admin, always. */
  realUserId: string
  realRole: WorkspaceRole
  isImpersonating: boolean
  impersonatedName: string | null
  impersonatedEmail: string | null
}

/**
 * Resolve the effective actor for the current request.
 *
 * Returns null when there is no authenticated user with an active membership
 * (callers should treat that as "redirect to /login").
 *
 * This is the single source of truth for "who am I acting as" — the codebase
 * previously inlined `getUser()` + a `workspace_members` lookup in every page
 * and route; new/updated callsites should use this so impersonation is honoured
 * consistently.
 */
export async function getActor(): Promise<Actor | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: realMember } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!realMember) return null

  const realRole = realMember.role as WorkspaceRole
  const workspaceId = realMember.workspace_id as string

  const base: Actor = {
    userId: user.id,
    workspaceId,
    role: realRole,
    realUserId: user.id,
    realRole,
    isImpersonating: false,
    impersonatedName: null,
    impersonatedEmail: null,
  }

  // Only admins may impersonate. Everyone else always acts as themselves.
  if (!isAdmin(realRole)) return base

  const store = await cookies()
  const targetId = store.get(VIEW_AS_COOKIE)?.value
  if (!targetId || targetId === user.id) return base

  // Re-verify every request: the target must be an active member of the SAME
  // workspace. A stale/tampered cookie silently falls back to the real admin.
  const { data: targetMember } = await admin
    .from('workspace_members')
    .select('user_id, role')
    .eq('user_id', targetId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .single()
  if (!targetMember) return base

  let name: string | null = null
  let email: string | null = null
  try {
    const { data } = await admin.auth.admin.getUserById(targetId)
    name =
      (data.user?.user_metadata?.full_name as string | undefined) ??
      (data.user?.user_metadata?.name as string | undefined) ??
      null
    email = data.user?.email ?? null
  } catch {
    // Best-effort display info only; impersonation still works without it.
  }

  return {
    ...base,
    userId: targetId,
    role: targetMember.role as WorkspaceRole,
    isImpersonating: true,
    impersonatedName: name,
    impersonatedEmail: email,
  }
}

/** True when the effective role meets or exceeds `admin`. */
export function actorIsAdmin(actor: Actor): boolean {
  return isAdmin(actor.role)
}
