import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUsersById } from '@/lib/users-cache'
import { ActivitiesClient } from './activities-client'

export const metadata: Metadata = { title: 'Activities' }

export default async function ActivitiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let activities: any[]  = []
  let teamMembers:  { id: string; name: string }[] = []
  let isAdmin = false

  if (user) {
    const admin = createAdminClient()
    const { data: member } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (member) {
      isAdmin = ['admin', 'super_admin'].includes(member.role)
      const workspaceId = member.workspace_id

      // Reps only see their own activities
      let actQuery = (admin as any)
        .from('follow_ups')
        .select('id, type, priority, title, notes, due_at, completed_at, assigned_to, created_at, lead:leads(id, first_name, last_name, email, phone, company)')
        .eq('workspace_id', workspaceId)
        .order('due_at', { ascending: true })

      if (!isAdmin) actQuery = actQuery.eq('assigned_to', user.id)

      const [activitiesResult, membersResult] = await Promise.all([
        actQuery,
        (admin as any).from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('is_active', true),
      ])

      activities = activitiesResult.data ?? []

      const memberIds = ((membersResult.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
      const usersById = await getUsersById(admin, memberIds)
      teamMembers = memberIds.map((id) => ({ id, name: usersById.get(id) ?? id }))
    }
  }

  return (
    <ActivitiesClient
      initialActivities={activities}
      teamMembers={teamMembers}
      currentUserId={user?.id ?? ''}
      isAdmin={isAdmin}
    />
  )
}
