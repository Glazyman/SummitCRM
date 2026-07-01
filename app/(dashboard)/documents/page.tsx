import { redirect } from 'next/navigation'
import { getActor } from '@/lib/auth/actor'
import { DocumentsClient } from './documents-client'

export const metadata = { title: 'Documents — Summit CRM' }

export default async function DocumentsPage() {
  // Admin-only feature. Effective actor gates it, so an admin viewing-as a rep
  // is bounced just like the rep would be.
  const actor = await getActor()
  if (!actor) redirect('/login')

  if (!['admin', 'super_admin'].includes(actor.role)) {
    redirect('/dashboard')
  }

  return <DocumentsClient />
}
