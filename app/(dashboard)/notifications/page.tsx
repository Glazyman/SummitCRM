import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { NotificationsClient } from './notifications-client'

export const metadata = { title: 'Notifications — Summits CRM' }

export default async function NotificationsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <NotificationsClient />
}
