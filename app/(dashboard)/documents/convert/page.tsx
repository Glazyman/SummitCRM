import { redirect } from 'next/navigation'
import { getActor } from '@/lib/auth/actor'
import { ConvertClient } from './convert-client'

export const metadata = { title: 'PDF → Word — Summit CRM' }

export default async function ConvertPage() {
  const actor = await getActor()
  if (!actor) redirect('/login')

  if (!['admin', 'super_admin'].includes(actor.role)) redirect('/dashboard')

  return <ConvertClient />
}
