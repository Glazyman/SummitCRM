import { redirect } from 'next/navigation'

export const metadata = { title: 'Notifications — Summits CRM' }

export default async function NotificationsPage() {
  redirect('/dashboard')
}
