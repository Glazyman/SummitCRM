import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'
import { getUsersById } from '@/lib/users'
import { LeadsClient }       from './leads-client'
import { Spinner } from '@/components/ui/spinner'
import type { LeadRow, LeadStatus, StatusCount } from '@/components/leads/types'
import type { InterestStatus } from '@/types/database'

export const metadata: Metadata = { title: 'Leads' }
export const dynamic = 'force-dynamic'

// 0 is the sentinel for "All" (server-side this maps to a large cap).
const ALLOWED_PER_PAGE = [25, 50, 100, 0] as const
const DEFAULT_PER_PAGE = 50
const ALL_PAGE_HARD_CAP = 50_000

function parseIntInRange(raw: string | undefined, defaultValue: number, min = 1, max = 1_000_000) {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n) || n < min || n > max) return defaultValue
  return n
}

function parsePerPage(raw: string | undefined): number {
  if (raw === 'all') return 0
  const n = parseInt(raw ?? '', 10)
  return (ALLOWED_PER_PAGE as readonly number[]).includes(n) ? n : DEFAULT_PER_PAGE
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LeadsPage({ searchParams }: PageProps) {
  let isAdmin       = false
  let currentUserId = ''
  let workspaceId   = ''
  let role          = 'rep'
  let leads:         LeadRow[] = []
  let totalCount    = 0
  let statusCounts: StatusCount[] = []
  let batches:      { id: string; name: string }[] = []
  let teamMembers:  { id: string; name: string }[] = []
  let perPage       = DEFAULT_PER_PAGE
  let page          = 1

  const sp = await searchParams
  const sParam = (k: string): string | undefined => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }

  try {
    const supabase = await createClient()
    // Effective actor: impersonated teammate when an admin is "viewing as"
    // someone, else the real user. Scoping keys off this.
    const actor = await getActor()

    if (actor) {
      currentUserId = actor.userId
      role    = actor.role
      isAdmin = ['super_admin', 'admin'].includes(role)
      workspaceId = actor.workspaceId
      const isRep = role === 'rep'

      perPage = parsePerPage(sParam('per'))
      page    = parseIntInRange(sParam('page'), 1, 1, 100000)

      const statusesArr = (sParam('status') ?? '').split(',').filter(Boolean)
      const interestsArr = (sParam('interest') ?? '').split(',').filter(Boolean)
      const assignedRaw = sParam('assigned') ?? null
      const assignedUnassigned = assignedRaw === 'unassigned'
      const assignedTo = assignedUnassigned ? null : assignedRaw

      const adminForLeads = createAdminClient()

      const [pageResult, batchesResult, membersResult] = await Promise.all([
        (adminForLeads as any).rpc('get_workspace_leads_page', {
          p_workspace_id:        workspaceId,
          p_viewer_id:           actor.userId,
          p_scope_to_rep:        isRep,
          p_search:              sParam('q') ?? null,
          p_statuses:            statusesArr.length > 0 ? statusesArr : null,
          p_interests:           interestsArr.length > 0 ? interestsArr : null,
          p_batch_id:            sParam('batch') ?? null,
          p_assigned_to:         assignedTo,
          p_assigned_unassigned: assignedUnassigned,
          p_my_leads:            sParam('my') === '1',
          p_cold_only:           sParam('cold') === '1',
          p_date_from:           sParam('from') || null,
          p_date_to:             sParam('to')   || null,
          p_sort_by:             sParam('sort') ?? 'last_activity_at',
          p_sort_dir:            sParam('dir')  ?? 'desc',
          // perPage === 0 means "All". Use the hard cap so a runaway
          // workspace can't blow up the response, and skip offset.
          p_limit:               perPage === 0 ? ALL_PAGE_HARD_CAP : perPage,
          p_offset:              perPage === 0 ? 0 : (page - 1) * perPage,
        }),
        supabase
          .from('lead_batches')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false }),
        supabase
          .from('workspace_members')
          .select('user_id')
          .eq('workspace_id', workspaceId)
          .eq('is_active', true),
      ])

      const payload = (pageResult.data ?? {}) as {
        rows?: Array<Record<string, unknown>>
        total_count?: number
        status_counts?: Record<string, number>
      }

      batches = (batchesResult.data ?? []) as { id: string; name: string }[]
      const batchNames = new Map(batches.map((b) => [b.id, b.name]))

      const memberIds = ((membersResult.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
      const adminClient = createAdminClient()
      const usersById = await getUsersById(adminClient, workspaceId, memberIds)
      teamMembers = memberIds.map((id) => ({ id, name: usersById.get(id) ?? id }))

      type RawLead = {
        id: string; workspace_id: string; first_name: string | null; last_name: string | null
        email: string; phone: string | null; company: string | null; title: string | null
        website: string | null; linkedin_url: string | null
        status: LeadRow['status']; interest_status?: LeadRow['interest_status']
        pipeline_stage_id?: string | null; batch_id: string | null
        assigned_to: string | null; custom_fields: Record<string, string> | null
        created_at: string; updated_at: string
        last_contacted_at: string | null; last_call_outcome: string | null
        last_activity_at: string | null
      }
      const rawLeads = (payload.rows ?? []) as unknown as RawLead[]

      leads = rawLeads.map((lead) => ({
        ...lead,
        interest_status:   (lead.interest_status as InterestStatus) ?? 'pending',
        pipeline_stage_id: lead.pipeline_stage_id ?? null,
        batch_name:        lead.batch_id ? batchNames.get(lead.batch_id) ?? null : null,
        assigned_name:     lead.assigned_to ? usersById.get(lead.assigned_to) ?? null : null,
        last_contacted_at: lead.last_contacted_at ?? null,
        last_call_outcome: lead.last_call_outcome ?? null,
        last_activity_at:  lead.last_activity_at  ?? null,
        tags:              [],
        custom_fields:     lead.custom_fields ?? {},
      }))

      totalCount = payload.total_count ?? 0
      statusCounts = Object.entries(payload.status_counts ?? {}).map(([status, count]) => ({
        status: status as LeadStatus,
        count,
      }))
    }
  } catch (err) {
    console.error('[/leads page]', err)
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    }>
      <LeadsClient
        initialLeads={leads}
        totalCount={totalCount}
        statusCounts={statusCounts}
        page={page}
        perPage={perPage}
        batches={batches}
        teamMembers={teamMembers}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        role={role}
      />
    </Suspense>
  )
}
