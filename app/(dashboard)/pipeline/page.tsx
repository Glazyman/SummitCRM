import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metadata } from 'next'
import PipelineClient from './pipeline-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pipeline — Summits CRM' }

/** Parse questionnaire revenue strings like "$10.7M", "$2.5M", "$50K" → number */
function parseRevenueText(raw: unknown): number {
  if (!raw || typeof raw !== 'string') return 0
  const s = raw.trim()
  const num = parseFloat(s.replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return 0
  if (/[Bb]/.test(s)) return num * 1_000_000_000
  if (/[Mm]/.test(s)) return num * 1_000_000
  if (/[Kk]/.test(s)) return num * 1_000
  return num
}

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

  const admin = createAdminClient() as any

  // Load leads via RPC to bypass PostgREST row limit
  const { data: allLeadsJson } = await admin
    .rpc('get_workspace_leads_json', { p_workspace_id: member.workspace_id })

  const excluded = new Set(['do_not_contact', 'unsubscribed'])
  const isAdminRole = ['admin', 'super_admin'].includes(member.role)
  const rawLeads = ((allLeadsJson ?? []) as Array<{
    id: string; first_name: string | null; last_name: string | null;
    email: string; company: string | null; title: string | null; phone: string | null;
    status: string; interest_status: string; pipeline_stage_id: string | null;
    assigned_to: string | null; batch_id: string | null; created_at: string; updated_at: string
  }>)
    .filter((l) => !excluded.has(l.status))
    // Non-admins only see deals assigned to them. Admins see all.
    .filter((l) => isAdminRole || l.assigned_to === user.id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const leadIds = rawLeads.map((l) => l.id)

  // Fetch call logs and custom_fields (for revenue) in parallel
  const [callLogsResult, customFieldsResult] = await Promise.all([
    leadIds.length > 0
      ? supabase
          .from('call_logs')
          .select('lead_id, called_at')
          .in('lead_id', leadIds)
          .order('called_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    leadIds.length > 0
      ? admin
          .from('leads')
          .select('id, custom_fields')
          .in('id', leadIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] }),
  ])

  const lastContactedMap = new Map<string, string>()
  for (const row of ((callLogsResult.data ?? []) as Array<{ lead_id: string; called_at: string }>)) {
    if (!lastContactedMap.has(row.lead_id)) lastContactedMap.set(row.lead_id, row.called_at)
  }

  // Build revenue map from questionnaire answers
  const revenueMap = new Map<string, number>()
  for (const row of ((customFieldsResult.data ?? []) as Array<{ id: string; custom_fields: Record<string, unknown> }>)) {
    const answers = (row.custom_fields?._questionnaire as any)?.answers ?? {}
    const rev = parseRevenueText(answers.revenue)
    if (rev > 0) revenueMap.set(row.id, rev)
  }

  const leadsWithContact = rawLeads.map((lead) => ({
    ...lead,
    last_contacted_at: lastContactedMap.get(lead.id) ?? null,
    pipeline_value:    revenueMap.get(lead.id) ?? 0,
  }))

  const isAdmin = isAdminRole

  const defaultStages = stages.length === 0 ? [
    { id: 'new-lead',    workspace_id: member.workspace_id, name: 'New Lead',      color: '#6366f1', position: 0, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'contacted',   workspace_id: member.workspace_id, name: 'Contacted',     color: '#f59e0b', position: 1, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'qualified',   workspace_id: member.workspace_id, name: 'Qualified',     color: '#3b82f6', position: 2, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'proposal',    workspace_id: member.workspace_id, name: 'Proposal Sent', color: '#8b5cf6', position: 3, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'negotiating', workspace_id: member.workspace_id, name: 'Negotiating',   color: '#ec4899', position: 4, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'closed-won',  workspace_id: member.workspace_id, name: 'Closed Won',    color: '#10b981', position: 5, is_won: true,  is_lost: false, created_at: '', updated_at: '' },
    { id: 'closed-lost', workspace_id: member.workspace_id, name: 'Closed Lost',   color: '#ef4444', position: 6, is_won: false, is_lost: true,  created_at: '', updated_at: '' },
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
