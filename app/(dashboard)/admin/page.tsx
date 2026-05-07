/**
 * app/(dashboard)/admin/page.tsx
 *
 * Server component entry point for the admin dashboard.
 * - Validates role (admin or manager only)
 * - Passes role info to client component for gating
 */
import { redirect } from 'next/navigation'
import { cookies }  from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { AdminDashboardClient } from './admin-dashboard-client'

export const metadata = { title: 'Admin Dashboard — Summits CRM' }

export default async function AdminDashboardPage() {
  const cookieStore = await cookies()
  const supabase    = await createServerClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const { data: member } = await adminClient
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { role: string } | null }

  const role = member?.role ?? 'rep'

  // Only admin and manager can access this page
  if (!['admin', 'super_admin', 'manager'].includes(role)) {
    redirect('/dashboard')
  }

  const isAdmin   = ['admin', 'super_admin'].includes(role)
  const isManager = role === 'manager'

  return (
    <AdminDashboardClient
      isAdmin={isAdmin}
      isManager={isManager}
      userRole={role}
    />
  )
}
