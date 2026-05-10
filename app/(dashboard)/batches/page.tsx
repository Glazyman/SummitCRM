import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BatchesClient } from './batches-client'

export const metadata: Metadata = { title: 'Batches' }

export default async function BatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { role: string } | null; error: unknown }

  if (!member || !['admin', 'super_admin'].includes(member.role)) {
    redirect('/dashboard')
  }

  return <BatchesClient />
}

