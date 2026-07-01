import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'
import type { Metadata } from 'next'
import TeamSettingsClient from './team-settings-client'

export const metadata: Metadata = { title: 'Team Members — Settings' }

export default async function TeamPage() {
  const supabase = await createClient() as any
  // Effective actor — an admin viewing-as a rep is treated as the rep and
  // bounced from this admin-only page.
  const actor = await getActor()
  if (!actor) redirect('/login')

  if (!['admin', 'super_admin'].includes(actor.role)) {
    redirect('/settings')
  }

  // Load pending invitations
  const { data: invitationsRaw } = await supabase
    .from('invitations')
    .select('id, email, role, expires_at, created_at, accepted_at')
    .eq('workspace_id', actor.workspaceId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  const invitations = (invitationsRaw ?? []) as Array<{
    id: string; email: string; role: string; expires_at: string; created_at: string; accepted_at: string | null
  }>

  const isAdmin = ['admin', 'super_admin'].includes(actor.role)

  return (
    <div className="space-y-4">
      <Link href="/settings" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <TeamSettingsClient
        workspaceId={actor.workspaceId}
        currentUserId={actor.userId}
        isAdmin={isAdmin}
        pendingInvitations={invitations ?? []}
      />
    </div>
  )
}
