import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DocumentsClient } from './documents-client'

export const metadata = { title: 'Documents — Summit CRM' }

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { role: string } | null }

  // Admin-only feature.
  if (!member || !['admin', 'super_admin'].includes(member.role)) {
    redirect('/dashboard')
  }

  return <DocumentsClient />
}
