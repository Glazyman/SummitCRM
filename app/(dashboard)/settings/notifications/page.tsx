import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { NotificationPreferencesPanel } from '@/components/notifications/notification-preferences-panel'

export const metadata = { title: 'Notification Preferences — Summits CRM' }

export default async function NotificationSettingsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-0 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Notification Preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control which notifications you receive and through which channels.
        </p>
      </div>
      <NotificationPreferencesPanel />
    </div>
  )
}
