import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  // Load leads with their pipeline stage (excluding deleted and unsubscribed/do_not_contact)
  const { data: rawLeadsData } = await supabase
    .from('leads')
    .select(`
      id, first_name, last_name, email, company, title, phone,
      status, interest_status, pipeline_stage_id,
      assigned_to, batch_id, created_at, updated_at
    `)
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .not('status', 'in', '("do_not_contact","unsubscribed")')
    .order('updated_at', { ascending: false })
    .limit(500)

  const rawLeads = (rawLeadsData ?? []) as Array<{
    id: string; first_name: string | null; last_name: string | null;
    email: string; company: string | null; title: string | null; phone: string | null;
    status: string; interest_status: string; pipeline_stage_id: string | null;
    assigned_to: string | null; batch_id: string | null; created_at: string; updated_at: string
  }>

  const isAdmin = ['admin', 'super_admin', 'manager'].includes(member.role)

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
      initialLeads={rawLeads as any}
      workspaceId={member.workspace_id}
      isAdmin={isAdmin}
    />
  )
}
