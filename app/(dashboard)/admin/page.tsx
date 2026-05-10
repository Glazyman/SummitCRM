import { redirect } from 'next/navigation'

export const metadata = { title: 'Admin Dashboard — Summits CRM' }

export default async function AdminDashboardPage() {
  redirect('/dashboard')
}
