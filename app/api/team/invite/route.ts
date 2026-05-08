import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WorkspaceRole } from '@/types/database'

// POST /api/team/invite — send email invitation to a new team member
export async function POST(req: NextRequest) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
  if (!['admin', 'super_admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Only admins can invite members' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { email, role = 'rep' }: { email: string; role: WorkspaceRole } = body

  if (!email?.trim()) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const validRoles: WorkspaceRole[] = ['viewer', 'rep', 'manager', 'admin']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Check for existing active member with that email
  const admin = createAdminClient() as any
  const { data: existingUsers } = await admin.auth.admin.listUsers()
  const existingUser = (existingUsers?.users as Array<{ id: string; email?: string }>)?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )

  // Check if already a member
  if (existingUser) {
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id, is_active')
      .eq('workspace_id', member.workspace_id)
      .eq('user_id', existingUser.id)
      .single()

    if (existingMember?.is_active) {
      return NextResponse.json({ error: 'User is already a member' }, { status: 409 })
    }
  }

  // Create/upsert invitation token
  const token    = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days

  const { data: invitation, error: invErr } = await supabase
    .from('invitations')
    .upsert(
      {
        workspace_id: member.workspace_id,
        email:        email.toLowerCase().trim(),
        role,
        token,
        invited_by:   user.id,
        accepted_at:  null,
        expires_at:   expiresAt,
      },
      { onConflict: 'workspace_id,email', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  // Get workspace name
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', member.workspace_id)
    .single()

  // Send invite email via Supabase auth or Resend
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/accept-invite?token=${token}`

  // Use Supabase to send the invite email if user doesn't exist yet
  if (!existingUser) {
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteUrl,
      data: {
        invitation_token: token,
        workspace_name:   workspace?.name ?? 'Summits CRM',
        role,
      },
    }).catch(() => null) // Non-fatal — they can still use the token link
  }

  // Log activity
  await supabase.from('activity_logs').insert({
    workspace_id: member.workspace_id,
    lead_id:      null,
    user_id:      user.id,
    type:         'member_invited',
    metadata:     { email, role },
  })

  return NextResponse.json({
    invitation: { id: invitation.id, email, role, expires_at: expiresAt, invite_url: inviteUrl },
  }, { status: 201 })
}
