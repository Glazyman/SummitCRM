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

      const role = member?.role ?? 'rep'
      isAdmin    = ['super_admin', 'admin', 'manager'].includes(role)
      workspaceId = member?.workspace_id ?? ''

      const [leadsResult, batchesResult, membersResult] = await Promise.all([
        supabase
          .from('leads')
          .select('id, workspace_id, first_name, last_name, email, phone, company, title, website, linkedin_url, status, batch_id, assigned_to, source, created_at, updated_at')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1000),
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

      leads = ((leadsResult.data ?? []) as Array<{
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
        batch_id: string | null
        assigned_to: string | null
        source: string | null
        created_at: string
        updated_at: string
      }>).map((lead) => ({
        ...lead,
        batch_name: lead.batch_id ? batchNames.get(lead.batch_id) ?? null : null,
        assigned_name: lead.assigned_to ? usersById.get(lead.assigned_to) ?? null : null,
        last_activity_at: null,
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
      />
    </Suspense>
  )
}
