import { selectAll } from '@/lib/supabase/select-all'
import { firstCalls } from '@/lib/first-calls'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'
import { resolveDailyCallTarget } from '@/lib/call-targets'
import { getUsersById } from '@/lib/users'
import { fetchQueueCount } from '@/lib/call-mode/queue'
import { parseBatchId, parseQueuePreset } from '@/lib/call-mode/types'
import { CallModeClient } from './call-mode-client'

export const metadata: Metadata = { title: 'Call Mode' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The setup screen needs three numbers, a batch list and the daily target — NOT
 * the queue itself. The queue is built on demand by GET /api/call-mode/queue
 * when the rep presses "Start calling"; fetching it here meant shipping ~933KB
 * of lead rows (up to FETCH_CAP) through the RSC payload before anything
 * painted, which made this the slowest page in the app (~4.7s vs ~1.7s for
 * /leads). Keep it that way: don't reintroduce a queue fetch here.
 */
export default async function CallModePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const sParam = (k: string): string | undefined => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }

  const queue = parseQueuePreset(sParam('queue'))
  const batchId = parseBatchId(sParam('batch'))

  // Batch options for the setup-screen picker — empty for reps (they get no
  // batch filter; the server ignores the param for them regardless).
  let batchOptions: { id: string; name: string }[] = []
  let clientBatchId: string | null = batchId
  let currentUserId = ''
  let isAdmin = false
  // Workspace members (id + display name) for the optional full lead panel —
  // powers its note-assignment / follow-up assignee dropdowns.
  let teamMembers: { id: string; name: string }[] = []
  let loadError = false
  // Daily-target progress (resolveDailyCallTarget — same source as the
  // dashboard KPI). 0 = hide the target UI (set only when the queries succeed).
  let calledToday = 0
  let dailyTarget = 0
  // Leads matching the filters. Drives the setup count + the Start button's
  // enabled state; the rows themselves arrive at "Start calling".
  let totalMatching = 0

  try {
    const supabase = await createClient()
    // Effective actor: impersonated teammate when an admin is "viewing as"
    // someone, else the real user. Rep scoping + daily target key off this so an
    // admin viewing-as a rep gets exactly the rep's queue and target.
    const actor = await getActor()
    if (!actor) redirect('/login')

    currentUserId = actor.userId
    isAdmin = actor.role === 'admin' || actor.role === 'super_admin'
    const isRep = actor.role === 'rep'
    const admin = createAdminClient()

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const [countResult, batchesResult, workspaceResult, todayResult, membersResult] = await Promise.all([
      fetchQueueCount(actor, queue, batchId),
      supabase
        .from('lead_batches')
        .select('id, name')
        .eq('workspace_id', actor.workspaceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('workspaces')
        .select('settings')
        .eq('id', actor.workspaceId)
        .single(),
      selectAll<{ lead_id: string; called_at: string }>((from, to) => admin.from('call_logs')
        .select('lead_id, called_at').eq('workspace_id', actor.workspaceId).eq('logged_by', actor.userId)
        .order('id').range(from, to)).then(rows => ({ data: firstCalls(rows).filter(c => Date.parse(c.called_at) >= startOfToday.getTime()).length })),
      admin
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', actor.workspaceId)
        .eq('is_active', true),
    ])

    // Workspace members for the optional full lead panel's assignment dropdowns.
    const memberIds = ((membersResult.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
    const nameById = await getUsersById(admin, actor.workspaceId, memberIds)
    teamMembers = memberIds
      .map((id) => ({ id, name: nameById.get(id) ?? 'Unknown' }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Daily target — shared resolution with the dashboard KPI. If either
    // query failed, leave dailyTarget=0 so the UI hides rather than showing a
    // fabricated "Today 0/100".
    if (workspaceResult.error || (todayResult as { error?: unknown }).error) {
      console.error('[/call-mode page] target queries failed', workspaceResult.error ?? (todayResult as { error?: unknown }).error)
    } else {
      const settings = (workspaceResult.data as { settings?: Record<string, unknown> } | null)?.settings
      dailyTarget = resolveDailyCallTarget(settings, actor.userId)
      calledToday = Number((todayResult as { data: number | null }).data ?? 0)
    }

    batchOptions = isRep ? [] : ((batchesResult.data ?? []) as { id: string; name: string }[])
    clientBatchId = isRep ? null : batchId

    // null = the count RPC failed. Surface the load-error state rather than a
    // fake empty queue.
    if (countResult === null) loadError = true
    else totalMatching = countResult
  } catch (err) {
    // redirect() throws NEXT_REDIRECT — let it propagate.
    if ((err as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw err
    console.error('[/call-mode page]', err)
    loadError = true
  }

  return (
    <CallModeClient
      batches={batchOptions}
      queue={queue}
      batchId={clientBatchId}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      teamMembers={teamMembers}
      loadError={loadError}
      calledToday={calledToday}
      dailyTarget={dailyTarget}
      totalMatching={totalMatching}
    />
  )
}
