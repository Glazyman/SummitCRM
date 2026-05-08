import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import TeamSettingsClient from './team-settings-client'

export const metadata: Metadata = { title: 'Team Members — Settings' }

export default async function TeamPage() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

  if (!currentMember || !['admin', 'super_admin'].includes(currentMember.role)) {
    redirect('/settings')
  }

  // Load pending invitations
  const { data: invitationsRaw } = await supabase
    .from('invitations')
    .select('id, email, role, expires_at, created_at, accepted_at')
    .eq('workspace_id', currentMember.workspace_id)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  const invitations = (invitationsRaw ?? []) as Array<{
    id: string; email: string; role: string; expires_at: string; created_at: string; accepted_at: string | null
  }>

  const isAdmin = ['admin', 'super_admin'].includes(currentMember.role)

  return (
    <div className="space-y-4">
      <Link href="/settings" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <TeamSettingsClient
        workspaceId={currentMember.workspace_id}
        currentUserId={user.id}
        isAdmin={isAdmin}
        pendingInvitations={invitations ?? []}
      />
    </div>
  )
}
