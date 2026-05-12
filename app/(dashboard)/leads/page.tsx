import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getUsersById } from '@/lib/users'
import { LeadsClient }       from './leads-client'
import { Spinner } from '@/components/ui/spinner'
import type { LeadRow } from '@/components/leads/types'

export const metadata: Metadata = { title: 'Leads' }

export default async function LeadsPage() {
  // ── Auth + workspace ───────────────────────────────────────────────────
  // Defaults are conservative: no admin access, anonymous user
  let isAdmin       = false
  let currentUserId = ''
  let workspaceId   = ''
  let role          = 'rep'
  let leads: LeadRow[] = []
  let batches: { id: string; name: string }[] = []
  let teamMembers: { id: string; name: string }[] = []

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      currentUserId = user.id
      // Use DB member row as authoritative source — not JWT claims which can be stale
      const { data: member } = await supabase
        .from('workspace_members')
        .select('role, workspace_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single() as { data: { role: string; workspace_id: string } | null; error: unknown }

      role    = member?.role ?? 'rep'
      isAdmin = ['super_admin', 'admin'].includes(role)
      workspaceId = member?.workspace_id ?? ''
      const isRep = role === 'rep'

      // Use a PostgreSQL function via RPC — this bypasses PostgREST's db-max-rows
      // cap entirely, which was silently truncating results at 1,000 regardless
      // of .limit() or .range() calls.
      const adminForLeads = createAdminClient()

      const [leadsResult, batchesResult, membersResult] = await Promise.all([
        // Returns a single JSON array — PostgREST cannot cap a single-row response,
        // so this definitively bypasses the db-max-rows 1,000 row limit.
        adminForLeads.rpc('get_workspace_leads_json', {
          p_workspace_id: workspaceId,
          p_assigned_to:  isRep ? user.id : null,
          p_max_rows:     20000,
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

      batches = (batchesResult.data ?? []) as { id: string; name: string }[]
      const batchNames = new Map(batches.map((b) => [b.id, b.name]))

      const memberIds = ((membersResult.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
      const adminClient = createAdminClient()
      const usersById = await getUsersById(adminClient, workspaceId, memberIds)

      teamMembers = memberIds.map((id) => ({ id, name: usersById.get(id) ?? id }))

      // get_workspace_leads_json returns a single JSON value (the array),
      // so leadsResult.data is the array itself, not an array of rows.
      const rawLeads = ((leadsResult.data ?? []) as unknown as Array<{
        id: string
        workspace_id: string
        first_name: string | null
        last_name: string | null
        email: string
        phone: string | null
        company: string | null
        title: string | null
        website: string | null
        linkedin_url: string | null
        status: LeadRow['status']
        interest_status?: LeadRow['interest_status']
        pipeline_stage_id?: string | null
        batch_id: string | null
        assigned_to: string | null
        custom_fields: Record<string, string> | null
        created_at: string
        updated_at: string
      }>)

      const leadIds = rawLeads.map((l) => l.id)
      const { data: callLogsRaw } = leadIds.length > 0
        ? await adminForLeads
            .from('call_logs')
            .select('lead_id, called_at, outcome')
            .in('lead_id', leadIds)
            .order('called_at', { ascending: false })
            .range(0, 49999)
        : { data: [] as Array<{ lead_id: string; called_at: string; outcome: string | null }> }

      const lastContactedMap = new Map<string, string>()
      const lastCallOutcomeMap = new Map<string, string>()
      for (const row of (callLogsRaw ?? []) as Array<{ lead_id: string; called_at: string; outcome: string | null }>) {
        if (!lastContactedMap.has(row.lead_id)) lastContactedMap.set(row.lead_id, row.called_at)
        if (!lastCallOutcomeMap.has(row.lead_id)) lastCallOutcomeMap.set(row.lead_id, row.outcome ?? '')
      }

      leads = rawLeads.map((lead) => ({
        ...lead,
        interest_status:  lead.interest_status  ?? 'pending',
        pipeline_stage_id: lead.pipeline_stage_id ?? null,
        batch_name:        lead.batch_id ? batchNames.get(lead.batch_id) ?? null : null,
        assigned_name:     lead.assigned_to ? usersById.get(lead.assigned_to) ?? null : null,
        last_contacted_at: lastContactedMap.get(lead.id) ?? null,
        last_call_outcome: lastCallOutcomeMap.get(lead.id) || null,
        last_activity_at:  null,
        tags:              [],
        custom_fields:     lead.custom_fields ?? {},
      }))
    }
  } catch {
    // Graceful degradation: show leads in read-only mode
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    }>
      <LeadsClient
        initialLeads={leads}
        batches={batches}
        teamMembers={teamMembers}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        role={role}
      />
    </Suspense>
  )
}
