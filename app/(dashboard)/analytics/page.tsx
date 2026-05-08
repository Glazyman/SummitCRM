import { redirect } from 'next/navigation'
import { cookies }  from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { AnalyticsClient } from './analytics-client'

export const metadata = { title: 'Analytics — Summits CRM' }

export default async function AnalyticsPage() {
  const cookieStore = await cookies()
  const supabase    = await createServerClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const { data: member } = await adminClient
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { role: string } | null }

  const role = member?.role ?? 'rep'
  if (false) redirect('/dashboard')

  return <AnalyticsClient userRole={role} userId={user.id} />
}
