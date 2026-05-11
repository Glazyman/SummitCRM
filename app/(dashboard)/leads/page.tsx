import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createAdminClient, createClient } from '@/lib/supabase/server'
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

      let leadsQuery = supabase
        .from('leads')
        .select('id, workspace_id, first_name, last_name, email, phone, company, title, website, linkedin_url, status, interest_status, pipeline_stage_id, batch_id, assigned_to, custom_fields, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20000)

      // Reps only see leads assigned to them
      if (isRep) leadsQuery = leadsQuery.eq('assigned_to', user.id)

      const [leadsResult, batchesResult, membersResult] = await Promise.all([
        leadsQuery,
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
      const { data: usersData } = await adminClient.auth.admin.listUsers()
      const usersById = new Map(
        (usersData.users ?? [])
          .filter((u) => memberIds.includes(u.id))
          .map((u) => [
            u.id,
            (u.user_metadata?.full_name as string | undefined) ?? u.email ?? u.id,
          ])
      )

      teamMembers = memberIds.map((id) => ({ id, name: usersById.get(id) ?? id }))

      const rawLeads = (leadsResult.data ?? []) as Array<{
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
      }>

      const leadIds = rawLeads.map((l) => l.id)
      const { data: callLogsRaw } = leadIds.length > 0
        ? await supabase
            .from('call_logs')
            .select('lead_id, called_at, outcome')
            .in('lead_id', leadIds)
            .order('called_at', { ascending: false })
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
