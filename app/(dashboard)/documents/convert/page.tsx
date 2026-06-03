import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ConvertClient } from './convert-client'

export const metadata = { title: 'PDF → Word — Summit CRM' }

export default async function ConvertPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { role: string } | null }

  if (!member || !['admin', 'super_admin'].includes(member.role)) redirect('/dashboard')

  return <ConvertClient />
}
