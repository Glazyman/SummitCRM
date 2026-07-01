import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/utils/roles'
import { VIEW_AS_COOKIE } from '@/lib/auth/actor'
import type { WorkspaceRole } from '@/types/database'
/* eslint-disable @typescript-eslint/no-explicit-any */

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

/**
 * Resolve the REAL authenticated caller (never the impersonated identity) and
 * their workspace membership. Start/stop must key on this so an impersonated
 * session can't chain into another user or escalate.
 */
async function realCaller() {
  const supabase = (await createClient()) as any
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient() as any
  const { data: member } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!member) return null
  return {
    admin,
    userId: user.id as string,
    workspaceId: member.workspace_id as string,
    role: member.role as WorkspaceRole,
  }
}

// POST /api/impersonation  { userId }  — start "viewing as" a teammate (admin only)
export async function POST(req: NextRequest) {
  const caller = await realCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(caller.role)) {
    return NextResponse.json({ error: 'Only admins can view as another user' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const targetId: unknown = body?.userId
  if (!targetId || typeof targetId !== 'string') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const store = await cookies()

  // Viewing-as yourself is a no-op / exit.
  if (targetId === caller.userId) {
    store.delete(VIEW_AS_COOKIE)
    return NextResponse.json({ success: true, impersonating: false })
  }

  // Target must be an active member of the caller's own workspace.
  const { data: target } = await caller.admin
    .from('workspace_members')
    .select('user_id, role')
    .eq('user_id', targetId)
    .eq('workspace_id', caller.workspaceId)
    .eq('is_active', true)
    .single()
  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  store.set(VIEW_AS_COOKIE, targetId, COOKIE_OPTS)

  // Audit under the REAL admin (best-effort — never block the switch). NOTE:
  // the Supabase query builder is a thenable, not a Promise, so it has no
  // .catch() — wrap the await in try/catch instead.
  try {
    await caller.admin.from('activity_logs').insert({
      workspace_id: caller.workspaceId,
      lead_id: null,
      user_id: caller.userId,
      type: 'impersonation_started',
      metadata: { target_user_id: targetId, target_role: target.role },
    })
  } catch {
    // ignore audit failures
  }

  return NextResponse.json({ success: true, impersonating: true })
}

// DELETE /api/impersonation — stop viewing-as, return to the admin's own account
export async function DELETE() {
  const supabase = (await createClient()) as any
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const store = await cookies()
  const prev = store.get(VIEW_AS_COOKIE)?.value
  store.delete(VIEW_AS_COOKIE)

  if (prev) {
    const admin = createAdminClient() as any
    const { data: member } = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    if (member) {
      try {
        await admin.from('activity_logs').insert({
          workspace_id: member.workspace_id,
          lead_id: null,
          user_id: user.id,
          type: 'impersonation_stopped',
          metadata: { target_user_id: prev },
        })
      } catch {
        // ignore audit failures
      }
    }
  }

  return NextResponse.json({ success: true, impersonating: false })
}
