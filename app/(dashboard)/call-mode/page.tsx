import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { resolveDailyCallTarget } from '@/lib/call-targets'
import { getUsersById } from '@/lib/users'
import { CallModeClient, type QueueLead, type QueuePreset } from './call-mode-client'

export const metadata: Metadata = { title: 'Call Mode' }
export const dynamic = 'force-dynamic'

// Which lead statuses each queue preset pulls. Built on the same
// get_workspace_leads_page RPC as /leads, so rep scoping (reps only see
// assigned leads) is enforced server-side identically. There is no callbacks
// preset: `callback` is not a lead status — callback promises become
// follow_ups tasks (the calls API returns a suggestion for that outcome).
const QUEUE_STATUSES: Record<QueuePreset, string[]> = {
  fresh: ['new'],
  retry: ['voicemail', 'no_answer'],
  all:   ['new', 'voicemail', 'no_answer'],
}

// Never-touched leads have last_activity_at = NULL, and the RPC orders
// NULLS LAST — so "fresh" queues must sort by created_at or untouched
// imports would sort to the very end and fall off the fetch cap.
const QUEUE_SORT: Record<QueuePreset, string> = {
  fresh: 'created_at',
  retry: 'last_activity_at',
  all:   'created_at',
}

// Pull the whole matching set so a rep can work a batch/queue to the end in one
// session (no per-session cap). get_workspace_leads_page returns one jsonb blob,
// so PostgREST's 1000-row cap doesn't apply. The high ceiling is just a memory/
// payload guard — if a queue ever exceeds it the "of N matching" note kicks in.
const FETCH_CAP = 5000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CallModePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const sParam = (k: string): string | undefined => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }

  const queue: QueuePreset = (['fresh', 'retry', 'all'] as const).includes(sParam('queue') as QueuePreset)
    ? (sParam('queue') as QueuePreset)
    : 'fresh'
  const rawBatch = sParam('batch') || null
  const batchId = rawBatch && UUID_RE.test(rawBatch) ? rawBatch : null

  let leads: QueueLead[] = []
  // Batch options for the setup-screen picker — empty for reps (they get no
  // batch filter); the full list is still fetched internally for name chips.
  let batchOptions: { id: string; name: string }[] = []
  let clientBatchId: string | null = batchId
  let skippedNoPhone = 0
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
  // Total leads matching the filters (the queue itself is capped per session).
  let totalMatching = 0

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: member } = await supabase
      .from('workspace_members')
      .select('role, workspace_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { role: string; workspace_id: string } | null; error: unknown }

    if (!member) return <CallModeClient leads={[]} batches={[]} queue={queue} batchId={batchId} skippedNoPhone={0} />

    currentUserId = user.id
    isAdmin = member.role === 'admin' || member.role === 'super_admin'
    const isRep = member.role === 'rep'
    // Reps work their own assigned leads — no batch picking (admins/managers
    // can filter any batch). Enforced here, not just hidden in the UI.
    const effectiveBatchId = isRep ? null : batchId
    const admin = createAdminClient()

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const [pageResult, batchesResult, workspaceResult, todayResult, membersResult] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).rpc('get_workspace_leads_page', {
        p_workspace_id:        member.workspace_id,
        p_viewer_id:           user.id,
        p_scope_to_rep:        isRep,
        p_search:              null,
        p_statuses:            QUEUE_STATUSES[queue],
        p_interests:           null,
        p_batch_id:            effectiveBatchId,
        p_assigned_to:         null,
        p_assigned_unassigned: false,
        p_my_leads:            false,
        p_cold_only:           false,
        p_date_from:           null,
        p_date_to:             null,
        // Most-neglected first (see QUEUE_SORT for the NULLS LAST caveat).
        p_sort_by:             QUEUE_SORT[queue],
        p_sort_dir:            'asc',
        p_limit:               FETCH_CAP,
        p_offset:              0,
      }),
      supabase
        .from('lead_batches')
        .select('id, name')
        .eq('workspace_id', member.workspace_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('workspaces')
        .select('settings')
        .eq('id', member.workspace_id)
        .single(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).rpc('get_unique_leads_called', {
        p_workspace_id: member.workspace_id,
        p_user_id:      user.id,
        p_since:        startOfToday.toISOString(),
      }),
      admin
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', member.workspace_id)
        .eq('is_active', true),
    ])

    // Workspace members for the optional full lead panel's assignment dropdowns.
    const memberIds = ((membersResult.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
    const nameById = await getUsersById(admin, member.workspace_id, memberIds)
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
      dailyTarget = resolveDailyCallTarget(settings, user.id)
      calledToday = Number((todayResult as { data: number | null }).data ?? 0)
    }

    const batches = (batchesResult.data ?? []) as { id: string; name: string }[]
    const batchNames = new Map(batches.map((b) => [b.id, b.name]))
    batchOptions = isRep ? [] : batches
    clientBatchId = effectiveBatchId

    if (pageResult.error) {
      console.error('[/call-mode page] queue RPC failed', pageResult.error)
      loadError = true
    }

    type RawLead = {
      id: string; first_name: string | null; last_name: string | null
      email: string | null; phone: string | null; company: string | null; title: string | null
      website: string | null
      status: string; interest_status: string | null; batch_id: string | null
      last_contacted_at: string | null; last_call_outcome: string | null
      custom_fields: Record<string, string> | null
    }
    const payload = (pageResult.data ?? {}) as { rows?: RawLead[]; total_count?: number }
    const rows = payload.rows ?? []

    // Filter on the SANITIZED number — "N/A"-style phone values would
    // otherwise pass and render a dead tel: link.
    const withPhone = rows.filter((l) => (l.phone ?? '').replace(/[^+\d]/g, '').length > 0)
    skippedNoPhone = rows.length - withPhone.length
    // Callable total: subtract the known phoneless leads so "of N matching"
    // doesn't promise leads a future session can never serve.
    totalMatching = Math.max(0, (payload.total_count ?? rows.length) - skippedNoPhone)

    leads = withPhone.map((l) => ({
      id:                l.id,
      first_name:        l.first_name,
      last_name:         l.last_name,
      email:             l.email,
      website:           l.website,
      phone:             (l.phone as string).trim(),
      company:           l.company,
      title:             l.title,
      status:            l.status,
      batch_name:        l.batch_id ? batchNames.get(l.batch_id) ?? null : null,
      last_contacted_at: l.last_contacted_at,
      last_call_outcome: l.last_call_outcome,
      state:             l.custom_fields?.contact_state || l.custom_fields?.company_state || null,
    }))
  } catch (err) {
    // redirect() throws NEXT_REDIRECT — let it propagate.
    if ((err as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw err
    console.error('[/call-mode page]', err)
    loadError = true
  }

  return (
    <CallModeClient
      leads={leads}
      batches={batchOptions}
      queue={queue}
      batchId={clientBatchId}
      skippedNoPhone={skippedNoPhone}
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
