import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AnalyticsClient } from './analytics-client'
import type { WorkspaceRole } from '@/types/database'

export const metadata = { title: 'Analytics — Summits CRM' }

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { role: WorkspaceRole } | null; error: unknown }

  const role = member?.role ?? 'rep'
  if (!['admin', 'super_admin'].includes(role)) {
    redirect('/dashboard')
  }

  return <AnalyticsClient userRole={role} userId={user.id} />
}
