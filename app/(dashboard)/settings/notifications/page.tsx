import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { NotificationPreferencesPanel } from '@/components/notifications/notification-preferences-panel'
import { NotificationsClient } from '@/app/(dashboard)/notifications/notifications-client'

export const metadata = { title: 'Notifications — Settings' }

export default async function NotificationSettingsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Reps can view their own notifications + preferences too. No admin gate.
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { role: string } | null; error: unknown }

  if (!member) redirect('/settings')

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-0 py-6 space-y-8">
      <div>
        <Link href="/settings" className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Settings
        </Link>
        <div>
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything that's been sent to you. Toggle read state, dismiss, or change which kinds you get.
          </p>
        </div>
      </div>

      {/* History — full list of past notifications, with filters + pagination */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">All notifications</h2>
        <NotificationsClient />
      </section>

      {/* Preferences — which types to receive, channels, etc. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Preferences</h2>
        <NotificationPreferencesPanel />
      </section>
    </div>
  )
}
