import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUsersById } from '@/lib/users'
import { getTagsByLeadIds } from '@/lib/lead-tags'
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
  const isAdminRole = ['admin', 'super_admin'].includes(member.role)

  // Server-side trim: top 100 per stage by last_activity_at + per-stage counts
  // + workspace totals, all in one jsonb response. No more loading every lead.
  const { data: payload } = await admin.rpc('get_pipeline_leads_json', {
    p_workspace_id:    member.workspace_id,
    p_assigned_to:     isAdminRole ? null : user.id,
    p_per_stage_limit: 100,
    p_search:          null,
  }) as { data: {
    leads:  Array<{
      id: string; first_name: string | null; last_name: string | null;
      email: string; company: string | null; title: string | null; phone: string | null;
      status: string; interest_status: string; pipeline_stage_id: string | null;
      assigned_to: string | null; batch_id: string | null; created_at: string; updated_at: string;
      last_contacted_at: string | null; last_activity_at: string | null;
      custom_fields: Record<string, unknown> | null;
    }>
    counts: Record<string, number>
    totals: { total_leads: number; hot_leads: number; deals_won: number; deals_in_progress: number }
  } | null }

  const rawLeads = payload?.leads ?? []
  const stageCounts = payload?.counts ?? {}
  const totals = payload?.totals ?? { total_leads: 0, hot_leads: 0, deals_won: 0, deals_in_progress: 0 }

  // Revenue from questionnaire (only for the visible/trimmed set).
  const leadIds = rawLeads.map((l) => l.id)
  const customFieldsResult = leadIds.length > 0
    ? await admin
        .from('leads')
        .select('id, custom_fields')
        .in('id', leadIds)
        .is('deleted_at', null)
    : { data: [] }

  const revenueMap = new Map<string, number>()
  for (const row of ((customFieldsResult.data ?? []) as Array<{ id: string; custom_fields: Record<string, unknown> }>)) {
    const answers = (row.custom_fields?._questionnaire as any)?.answers ?? {}
    const rev = parseRevenueText(answers.revenue)
    if (rev > 0) revenueMap.set(row.id, rev)
  }

  // Tags for the visible cards (one query for the whole trimmed set).
  const tagsMap = await getTagsByLeadIds(admin, leadIds)

  const initialLeads = rawLeads.map((lead) => ({
    ...lead,
    last_contacted_at: lead.last_contacted_at ?? null,
    last_activity_at:  lead.last_activity_at  ?? null,
    pipeline_value:    revenueMap.get(lead.id) ?? 0,
    tags:              tagsMap.get(lead.id) ?? [],
  }))

  // Filter options for the toolbar (admin only — reps don't filter by rep,
  // and only see their own leads). Reps/batches power the pipeline filter bar.
  let repOptions: Array<{ id: string; name: string }> = []
  let batchOptions: Array<{ id: string; name: string }> = []
  if (isAdminRole) {
    const [membersRes, batchesRes] = await Promise.all([
      admin.from('workspace_members').select('user_id').eq('workspace_id', member.workspace_id).eq('is_active', true),
      admin.from('lead_batches').select('id, name').eq('workspace_id', member.workspace_id).order('created_at', { ascending: false }),
    ])
    const memberIds = ((membersRes.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
    const nameById  = await getUsersById(admin, member.workspace_id, memberIds)
    repOptions = memberIds
      .map((id) => ({ id, name: nameById.get(id) ?? 'Unknown' }))
      .sort((a, b) => a.name.localeCompare(b.name))
    batchOptions = ((batchesRes.data ?? []) as Array<{ id: string; name: string }>)
      .map((b) => ({ id: b.id, name: b.name }))
  }

  const defaultStages = stages.length === 0 ? [
    { id: 'interested',     workspace_id: member.workspace_id, name: 'Interested',       color: '#6366f1', position: 0, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'seeking-buyer',  workspace_id: member.workspace_id, name: 'Seeking Buyer',    color: '#3b82f6', position: 1, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'intro-made',     workspace_id: member.workspace_id, name: 'Intro Made',       color: '#f59e0b', position: 2, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'data-requested', workspace_id: member.workspace_id, name: 'Data Requested',   color: '#8b5cf6', position: 3, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'loi',            workspace_id: member.workspace_id, name: 'LOI / Negotiation', color: '#ec4899', position: 4, is_won: false, is_lost: false, created_at: '', updated_at: '' },
    { id: 'closed-won',     workspace_id: member.workspace_id, name: 'Closed / Won',     color: '#10b981', position: 5, is_won: true,  is_lost: false, created_at: '', updated_at: '' },
    { id: 'lost-passed',    workspace_id: member.workspace_id, name: 'Lost / Passed',    color: '#ef4444', position: 6, is_won: false, is_lost: true,  created_at: '', updated_at: '' },
  ] : stages

  return (
    <PipelineClient
      stages={defaultStages as any}
      initialLeads={initialLeads as any}
      initialStageCounts={stageCounts}
      initialTotals={totals}
      workspaceId={member.workspace_id}
      isAdmin={isAdminRole}
      currentUserId={user.id}
      repOptions={repOptions}
      batchOptions={batchOptions}
    />
  )
}
