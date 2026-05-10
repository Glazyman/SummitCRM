import { redirect } from 'next/navigation'

export const metadata = { title: 'Analytics — Summits CRM' }

export default async function AnalyticsPage() {
  redirect('/dashboard')
}
