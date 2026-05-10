import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metadata } from 'next'
import AcceptInviteClient from './accept-invite-client'

export const metadata: Metadata = { title: 'Accept Invitation — Summits CRM' }

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/login')

  // Use admin client — the visitor is unauthenticated so RLS would block a regular client
  const admin = createAdminClient() as any

  // Look up the invitation
  const { data: invitation } = await admin
    .from('invitations')
    .select('id, workspace_id, email, role, expires_at, accepted_at, workspaces(name)')
    .eq('token', token)
    .single() as { data: { id: string; workspace_id: string; email: string; role: string; expires_at: string; accepted_at: string | null; workspaces?: { name?: string } | null } | null; error: unknown }

  if (!invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-sm">
          <div className="text-4xl">🔗</div>
          <h1 className="text-xl font-bold">Invitation not found</h1>
          <p className="text-sm text-muted-foreground">
            This invitation link is invalid or has already been used.
          </p>
          <a href="/login" className="text-sm text-primary hover:underline">
            Go to login →
          </a>
        </div>
      </div>
    )
  }

  if (invitation.accepted_at) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-sm">
          <div className="text-4xl">✅</div>
          <h1 className="text-xl font-bold">Invitation already accepted</h1>
          <p className="text-sm text-muted-foreground">
            This invitation has already been used. Please log in.
          </p>
          <a href="/login" className="text-sm text-primary hover:underline">
            Go to login →
          </a>
        </div>
      </div>
    )
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-sm">
          <div className="text-4xl">⏰</div>
          <h1 className="text-xl font-bold">Invitation expired</h1>
          <p className="text-sm text-muted-foreground">
            This invitation has expired. Please ask your admin to send a new one.
          </p>
          <a href="/login" className="text-sm text-primary hover:underline">
            Go to login →
          </a>
        </div>
      </div>
    )
  }

  const workspaceName = invitation.workspaces?.name ?? 'Summits CRM'

  return (
    <AcceptInviteClient
      token={token}
      email={invitation.email}
      role={invitation.role}
      workspaceName={workspaceName}
    />
  )
}
