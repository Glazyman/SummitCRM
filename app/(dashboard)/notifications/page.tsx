import { redirect } from 'next/navigation'

export const metadata = { title: 'Notifications — Summits CRM' }

// Old URL — now lives under Settings so reps and admins find it in
// the same place. Redirect for backwards-compat bookmarks.
export default async function NotificationsPage() {
  redirect('/settings/notifications')
}
