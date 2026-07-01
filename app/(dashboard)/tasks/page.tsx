import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor } from '@/lib/auth/actor'
import { getUsersById } from '@/lib/users'
import { TasksClient } from './tasks-client'

export const metadata: Metadata = { title: 'Tasks' }

export default async function TasksPage() {
  // Effective actor: impersonated teammate when an admin is "viewing as"
  // someone, else the real user. Reps (and admins viewing-as a rep) only see
  // their own tasks.
  const actor = await getActor()

  let activities: any[]  = []
  let teamMembers:  { id: string; name: string }[] = []
  let isAdmin = false

  if (actor) {
    const admin = createAdminClient()
    {
      isAdmin = ['admin', 'super_admin'].includes(actor.role)
      const workspaceId = actor.workspaceId

      // Reps only see their own activities
      let actQuery = (admin as any)
        .from('follow_ups')
        .select('id, type, priority, title, notes, due_at, completed_at, assigned_to, created_at, lead:leads(id, first_name, last_name, email, phone, company)')
        .eq('workspace_id', workspaceId)
        .order('due_at', { ascending: true })

      if (!isAdmin) actQuery = actQuery.eq('assigned_to', actor.userId)

      const [activitiesResult, membersResult] = await Promise.all([
        actQuery,
        (admin as any).from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('is_active', true),
      ])

      activities = activitiesResult.data ?? []

      const memberIds = ((membersResult.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
      const usersById = await getUsersById(admin, workspaceId, memberIds)
      teamMembers = memberIds.map((id) => ({ id, name: usersById.get(id) ?? id }))
    }
  }

  return (
    <TasksClient
      initialActivities={activities}
      teamMembers={teamMembers}
      currentUserId={actor?.userId ?? ''}
      isAdmin={isAdmin}
    />
  )
}
