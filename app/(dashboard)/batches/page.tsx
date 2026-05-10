import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BatchesClient } from './batches-client'

export const metadata: Metadata = { title: 'Batches' }

export default async function BatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <BatchesClient />
}

