import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
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

const QUEUE_CAP = 100      // one calling session's worth
const FETCH_CAP = 200      // fetch extra so filtering out phoneless leads still fills the queue
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
  let batches: { id: string; name: string }[] = []
  let skippedNoPhone = 0
  let currentUserId = ''
  let loadError = false

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
    const isRep = member.role === 'rep'
    const admin = createAdminClient()

    const [pageResult, batchesResult] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).rpc('get_workspace_leads_page', {
        p_workspace_id:        member.workspace_id,
        p_viewer_id:           user.id,
        p_scope_to_rep:        isRep,
        p_search:              null,
        p_statuses:            QUEUE_STATUSES[queue],
        p_interests:           null,
        p_batch_id:            batchId,
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
    ])

    batches = (batchesResult.data ?? []) as { id: string; name: string }[]
    const batchNames = new Map(batches.map((b) => [b.id, b.name]))

    if (pageResult.error) {
      console.error('[/call-mode page] queue RPC failed', pageResult.error)
      loadError = true
    }

    type RawLead = {
      id: string; first_name: string | null; last_name: string | null
      email: string | null; phone: string | null; company: string | null; title: string | null
      status: string; interest_status: string | null; batch_id: string | null
      last_contacted_at: string | null; last_call_outcome: string | null
      custom_fields: Record<string, string> | null
    }
    const rows = (((pageResult.data ?? {}) as { rows?: RawLead[] }).rows ?? [])

    // Filter on the SANITIZED number — "N/A"-style phone values would
    // otherwise pass and render a dead tel: link.
    const withPhone = rows.filter((l) => (l.phone ?? '').replace(/[^+\d]/g, '').length > 0)
    skippedNoPhone = rows.length - withPhone.length

    leads = withPhone.slice(0, QUEUE_CAP).map((l) => ({
      id:                l.id,
      first_name:        l.first_name,
      last_name:         l.last_name,
      email:             l.email,
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
      batches={batches}
      queue={queue}
      batchId={batchId}
      skippedNoPhone={skippedNoPhone}
      currentUserId={currentUserId}
      loadError={loadError}
    />
  )
}
