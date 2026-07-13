import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'
import { getUsersById } from '@/lib/users'
import { SessionsClient, type CallSessionRow } from './sessions-client'

export const metadata: Metadata = { title: 'Call sessions' }
export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function CallSessionsPage() {
  // Effective actor: honour admin "view as" — a rep-scoped view (real rep OR an
  // admin viewing-as a rep) must only see the rep's own sessions.
  const actor = await getActor()
  if (!actor) redirect('/login')
  const member = { workspace_id: actor.workspaceId, role: actor.role }
  const user = { id: actor.userId }

  const admin = createAdminClient() as any

  const canSeeAll = ['admin', 'super_admin', 'manager'].includes(member.role)

  let query = admin
    .from('call_sessions')
    .select('id, user_id, queue_preset, batch_id, queue_size, calls_logged, skipped, outcomes, started_at, ended_at')
    .eq('workspace_id', member.workspace_id)
    .order('started_at', { ascending: false })
    .limit(200)
  if (!canSeeAll) query = query.eq('user_id', user.id)

  const [{ data: rawSessions }, { data: batchRows }] = await Promise.all([
    query,
    admin.from('lead_batches').select('id, name').eq('workspace_id', member.workspace_id),
  ])

  const sessions = (rawSessions ?? []) as CallSessionRow[]
  const batchNames: Record<string, string> = {}
  ;((batchRows ?? []) as Array<{ id: string; name: string }>).forEach((b) => { batchNames[b.id] = b.name })

  // Resolve rep display names (only needed when an admin sees multiple reps).
  const userIds = [...new Set(sessions.map((s) => s.user_id))]
  const nameById = await getUsersById(admin, member.workspace_id, userIds)
  const names: Record<string, string> = {}
  userIds.forEach((id) => { names[id] = nameById.get(id) ?? 'Unknown' })

  return (
    <SessionsClient
      sessions={sessions}
      names={names}
      batchNames={batchNames}
      canSeeAll={canSeeAll}
    />
  )
}
