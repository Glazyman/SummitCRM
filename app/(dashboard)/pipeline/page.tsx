import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metadata } from 'next'
import PipelineClient from './pipeline-client'

export const metadata: Metadata = { title: 'Pipeline — Summits CRM' }

export default async function PipelinePage() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) redirect('/login')

  // Load pipeline stages
  const { data: stagesRaw } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .order('position')

  const stages = (stagesRaw ?? []) as Array<{
    id: string; workspace_id: string; name: string; color: string;
    position: number; is_won: boolean; is_lost: boolean; created_at: string; updated_at: string
  }>

  // Load leads via RPC to bypass PostgREST row limit, then filter in JS
  const admin = createAdminClient() as any
  const { data: allLeadsJson } = await admin
    .rpc('get_workspace_leads_json', { p_workspace_id: member.workspace_id })

  const excluded = new Set(['do_not_contact', 'unsubscribed'])
  const rawLeads = ((allLeadsJson ?? []) as Array<{
    id: string; first_name: string | null; last_name: string | null;
    email: string; company: string | null; title: string | null; phone: string | null;
    status: string; interest_status: string; pipeline_stage_id: string | null;
    assigned_to: string | null; batch_id: string | null; created_at: string; updated_at: string
  }>).filter((l) => !excluded.has(l.status))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const leadIds = rawLeads.map((l) => l.id)
  const { data: callLogsRaw } = leadIds.length > 0
    ? await supabase
        .from('call_logs')
        .select('lead_id, called_at')
        .in('lead_id', leadIds)
        .order('called_at', { ascending: false })
    : { data: [] as Array<{ lead_id: string; called_at: string }> }

  const lastContactedMap = new Map<string, string>()
  for (const row of (callLogsRaw ?? []) as Array<{ lead_id: string; called_at: string }>) {
    if (!lastContactedMap.has(row.lead_id)) lastContactedMap.set(row.lead_id, row.called_at)
  }

  const leadsWithContact = rawLeads.map((lead) => ({
    ...lead,
    last_contacted_at: lastContactedMap.get(lead.id) ?? null,
  }))

  const isAdmin = ['admin', 'super_admin'].includes(member.role)

  // If no stages exist yet, use defaults (will be seeded on first load)
  const defaultStages = stages.length === 0 ? [
    { id: 'new-lead',       workspace_id: member.workspace_id, name: 'New Lead',      color: '#6366f1', position: 0, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'contacted',      workspace_id: member.workspace_id, name: 'Contacted',     color: '#f59e0b', position: 1, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'qualified',      workspace_id: member.workspace_id, name: 'Qualified',     color: '#3b82f6', position: 2, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'proposal',       workspace_id: member.workspace_id, name: 'Proposal Sent', color: '#8b5cf6', position: 3, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'negotiating',    workspace_id: member.workspace_id, name: 'Negotiating',   color: '#ec4899', position: 4, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'closed-won',     workspace_id: member.workspace_id, name: 'Closed Won',    color: '#10b981', position: 5, is_won: true,  is_lost: false, created_at: '', updated_at: '' },
    { id: 'closed-lost',    workspace_id: member.workspace_id, name: 'Closed Lost',   color: '#ef4444', position: 6, is_won: false, is_lost: true,  created_at: '', updated_at: '' },
  ] : stages

  return (
    <PipelineClient
      stages={defaultStages as any}
      initialLeads={leadsWithContact as any}
      workspaceId={member.workspace_id}
      isAdmin={isAdmin}
      currentUserId={user.id}
    />
  )
}
