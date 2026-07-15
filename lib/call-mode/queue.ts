import 'server-only'

import { createAdminClient } from '@/lib/supabase/server'
import type { Actor } from '@/lib/auth/actor'
import { FETCH_CAP, type QueueLead, type QueuePreset, type QueueResponse } from './types'

/**
 * Call Mode queue building — the single place the queue is resolved, shared by
 * the /call-mode page (which only needs the COUNT to paint the setup screen)
 * and GET /api/call-mode/queue (which builds the real queue when the rep
 * presses "Start calling").
 *
 * Both paths MUST derive rep scoping identically — that's why this is one
 * module rather than two copies. See scopeFor().
 */

// Which lead statuses each queue preset pulls. Built on the same
// get_workspace_leads_page RPC as /leads, so rep scoping is enforced
// server-side identically.
const QUEUE_STATUSES: Record<QueuePreset, string[]> = {
  fresh: ['new'],
  retry: ['voicemail', 'no_answer'],
  all:   ['new', 'voicemail', 'no_answer'],
}

// Never-touched leads have last_activity_at = NULL, and the RPC orders NULLS
// LAST — so "fresh" queues must sort by created_at or untouched imports would
// sort to the very end and fall off the fetch cap.
const QUEUE_SORT: Record<QueuePreset, string> = {
  fresh: 'created_at',
  retry: 'last_activity_at',
  all:   'created_at',
}

interface RawLead {
  id: string; first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; company: string | null; title: string | null
  website: string | null
  status: string; interest_status: string | null; batch_id: string | null
  last_contacted_at: string | null; last_call_outcome: string | null
  custom_fields: Record<string, string> | null
}

/**
 * Rep scoping, resolved from the EFFECTIVE actor (so an admin viewing-as a rep
 * gets exactly the rep's queue). Reps are pinned to their assigned leads and
 * get no batch filter — enforced here, not merely hidden in the UI.
 */
function scopeFor(actor: Actor, batchId: string | null) {
  const isRep = actor.role === 'rep'
  return { isRep, effectiveBatchId: isRep ? null : batchId }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runQueueRpc(admin: any, actor: Actor, queue: QueuePreset, batchId: string | null, limit: number) {
  const { isRep, effectiveBatchId } = scopeFor(actor, batchId)
  return admin.rpc('get_workspace_leads_page', {
    p_workspace_id:        actor.workspaceId,
    p_viewer_id:           actor.userId,
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
    p_limit:               limit,
    p_offset:              0,
  })
}

/**
 * How many leads match the filters — WITHOUT shipping any of them.
 *
 * This is what the setup screen paints from. p_limit:1 because the RPC's
 * total_count is computed over the whole match regardless of the limit, so one
 * row is the cheapest way to read it. Returns null on failure so the caller can
 * show the load-error state rather than a fabricated 0.
 *
 * NOTE: counts every match, including leads with no usable phone (those are
 * dropped when the queue is actually built). Filtering by phone would need a
 * SQL-level predicate the RPC doesn't expose; the old code's "accurate" number
 * was itself only accurate within the fetched page, so this is no less true.
 */
export async function fetchQueueCount(
  actor: Actor,
  queue: QueuePreset,
  batchId: string | null,
): Promise<number | null> {
  const admin = createAdminClient()
  const res = await runQueueRpc(admin, actor, queue, batchId, 1)
  if (res.error) {
    console.error('[call-mode queue count]', res.error)
    return null
  }
  const payload = (res.data ?? {}) as { total_count?: number }
  return Number(payload.total_count ?? 0)
}

/**
 * Build the real queue. Called when the rep presses "Start calling", never on
 * page load — this is the 900KB+ payload that used to block the setup screen.
 */
export async function fetchQueue(
  actor: Actor,
  queue: QueuePreset,
  batchId: string | null,
): Promise<QueueResponse | null> {
  const admin = createAdminClient()

  const [pageResult, batchesResult] = await Promise.all([
    runQueueRpc(admin, actor, queue, batchId, FETCH_CAP),
    admin.from('lead_batches').select('id, name').eq('workspace_id', actor.workspaceId),
  ])

  if (pageResult.error) {
    console.error('[call-mode queue]', pageResult.error)
    return null
  }

  const batchNames = new Map(
    ((batchesResult.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]),
  )

  const payload = (pageResult.data ?? {}) as { rows?: RawLead[]; total_count?: number }
  const rows = payload.rows ?? []

  // Filter on the SANITIZED number — "N/A"-style phone values would otherwise
  // pass and render a dead tel: link.
  const withPhone = rows.filter((l) => (l.phone ?? '').replace(/[^+\d]/g, '').length > 0)
  const skippedNoPhone = rows.length - withPhone.length

  const leads: QueueLead[] = withPhone.map((l) => ({
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

  return {
    leads,
    skippedNoPhone,
    // Callable total: subtract the known phoneless leads so "of N matching"
    // doesn't promise leads a future session can never serve.
    totalMatching: Math.max(0, (payload.total_count ?? rows.length) - skippedNoPhone),
  }
}
