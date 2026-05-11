import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findUserByEmail } from '@/lib/users-cache'
import type { WorkspaceRole } from '@/types/database'
/* eslint-disable @typescript-eslint/no-explicit-any */

function buildInviteEmail(opts: {
  workspaceName: string
  role: string
  inviteUrl: string
}): { subject: string; html: string; text: string } {
  const roleLabel = opts.role === 'admin' ? 'Admin' : 'Rep'
  const subject = `You've been invited to join ${opts.workspaceName}`
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
      <h2 style="margin:0 0 8px">You're invited to ${opts.workspaceName}</h2>
      <p style="margin:0 0 24px;color:#555">
        You've been invited to join as a <strong>${roleLabel}</strong>.
        Click the button below to create your account and get started.
      </p>
      <a href="${opts.inviteUrl}"
         style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Accept invitation
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#888">
        This link expires in 7 days. If you weren't expecting this, you can ignore it.
      </p>
      <p style="margin:8px 0 0;font-size:12px;color:#bbb">
        Or copy this link: ${opts.inviteUrl}
      </p>
    </div>
  `
  const text = `You've been invited to join ${opts.workspaceName} as a ${roleLabel}.\n\nAccept your invitation: ${opts.inviteUrl}\n\nThis link expires in 7 days.`
  return { subject, html, text }
}

// POST /api/team/invite — send email invitation to a new team member
export async function POST(req: NextRequest) {
  const supabase = await createClient() as any
  const admin = createAdminClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await admin
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

  const validRoles: WorkspaceRole[] = ['rep', 'admin']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Check if already an active member
  const existingUser = await findUserByEmail(admin, email)

  if (existingUser) {
    const { data: existingMember } = await admin
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
  const token     = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: invitation, error: invErr } = await admin
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
  const { data: workspace } = await admin
    .from('workspaces')
    .select('name')
    .eq('id', member.workspace_id)
    .single()

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    req.nextUrl.origin ||
    'http://localhost:3000'
  const inviteUrl = `${baseUrl}/accept-invite?token=${token}`
  const workspaceName = workspace?.name ?? 'Summit Mergers CRM'

  // Send invite email via Resend
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@summitmergers.com'

  if (resendKey) {
    const resend = new Resend(resendKey)
    const { subject, html, text } = buildInviteEmail({ workspaceName, role, inviteUrl })
    const { error: emailErr } = await resend.emails.send({
      from:    `${workspaceName} <${fromEmail}>`,
      to:      [email],
      subject,
      html,
      text,
    })
    if (emailErr) {
      // Return the error so the admin knows the email failed
      return NextResponse.json({ error: `Invitation created but email failed: ${emailErr.message}` }, { status: 500 })
    }
  }

  // Log activity
  await admin.from('activity_logs').insert({
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

// DELETE /api/team/invite — cancel a pending invitation
export async function DELETE(req: NextRequest) {
  const supabase = await createClient() as any
  const admin = createAdminClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
  if (!['admin', 'super_admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Only admins can cancel invitations' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { invitation_id }: { invitation_id: string } = body
  if (!invitation_id) return NextResponse.json({ error: 'invitation_id is required' }, { status: 400 })

  const { error } = await admin
    .from('invitations')
    .delete()
    .eq('id', invitation_id)
    .eq('workspace_id', member.workspace_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
