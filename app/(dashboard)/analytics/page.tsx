import { redirect } from 'next/navigation'
import { getActor } from '@/lib/auth/actor'
import { AnalyticsClient } from './analytics-client'

export const metadata = { title: 'Analytics — Summits CRM' }

export default async function AnalyticsPage() {
  // Effective actor — an admin viewing-as a rep is treated as the rep, so this
  // admin-only page bounces them (faithful rep experience).
  const actor = await getActor()
  if (!actor) redirect('/login')

  const role = actor.role
  if (!['admin', 'super_admin'].includes(role)) {
    redirect('/dashboard')
  }

  return <AnalyticsClient userRole={role} userId={actor.userId} />
}
