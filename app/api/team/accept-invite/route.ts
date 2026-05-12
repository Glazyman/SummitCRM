import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findUserByEmail } from '@/lib/users'

// POST /api/team/accept-invite — accept invite, create account, join workspace
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { token, full_name, password } = body

  if (!token)     return NextResponse.json({ error: 'token is required' }, { status: 400 })
  if (!password)  return NextResponse.json({ error: 'password is required' }, { status: 400 })
  if (!full_name) return NextResponse.json({ error: 'full_name is required' }, { status: 400 })

  const admin = createAdminClient() as any

  // Fetch invitation via admin client — user is unauthenticated so RLS would block
  const { data: invitation, error: invErr } = await admin
    .from('invitations')
    .select('id, workspace_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .single()

  if (invErr || !invitation) {
    return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 })
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'Invitation already accepted' }, { status: 409 })
  }
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 })
  }

  // Check if user with this email already exists
  const existingUser = await findUserByEmail(admin, invitation.email) as
    | { id: string; email?: string; user_metadata?: Record<string, unknown>; email_confirmed_at?: string }
    | null

  let userId: string

  if (existingUser) {
    // Only update password if the account was never confirmed (incomplete signup).
    // If they already have a confirmed account, just update their name and re-add
    // them to the workspace — never reset the password of an active user.
    const isConfirmed = !!(existingUser as any).email_confirmed_at
    if (!isConfirmed) {
      await admin.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
        user_metadata: { full_name },
      })
    } else {
      await admin.auth.admin.updateUserById(existingUser.id, {
        user_metadata: { full_name },
      })
    }
    userId = existingUser.id
  } else {
    // Create new user account
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email:         invitation.email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (createErr || !newUser.user) {
      return NextResponse.json({ error: createErr?.message ?? 'Failed to create account' }, { status: 500 })
    }
    userId = newUser.user.id
    // (No cache to invalidate anymore — the RPC reads live from auth.users.)
  }

  // Upsert workspace membership
  const { error: memberErr } = await admin
    .from('workspace_members')
    .upsert(
      {
        workspace_id: invitation.workspace_id,
        user_id:      userId,
        role:         invitation.role,
        is_active:    true,
        joined_at:    new Date().toISOString(),
        invited_by:   null,
      },
      { onConflict: 'workspace_id,user_id' }
    )

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }

  // Mark invitation as accepted
  await admin
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  // Return the email so the client can sign in browser-side
  // (server-side signInWithPassword doesn't reliably set cookies in API routes)
  return NextResponse.json({ success: true, email: invitation.email })
}
