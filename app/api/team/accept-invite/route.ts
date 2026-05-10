import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const { data: usersData } = await admin.auth.admin.listUsers()
  const existingUser = (usersData?.users as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }> | undefined)?.find(
    (u) => u.email?.toLowerCase() === invitation.email.toLowerCase()
  )

  let userId: string

  if (existingUser) {
    // Always update password and name — this handles re-invited users whose
    // auth account wasn't fully deleted (e.g. silent delete failure)
    await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      user_metadata: { full_name },
    })
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
