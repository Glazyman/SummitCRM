import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { MobileSidebar } from '@/components/layout/mobile-sidebar'
import { NotificationProviderWrapper } from '@/components/notifications/notification-provider-wrapper'
import type { WorkspaceRole } from '@/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Server-side session check (middleware is the first line of defence)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch workspace membership — role, workspace name
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as {
      data: {
        workspace_id: string
        role: WorkspaceRole
        workspaces: { name: string } | null
      } | null
      error: unknown
    }

  // No active workspace membership — access has been revoked. Boot to login.
  if (!member) {
    redirect('/login')
  }

  const workspaceName = member.workspaces?.name ?? null
  const role = member.role ?? null
  const userName = user.user_metadata?.full_name as string | undefined ?? null
  const userEmail = user.email ?? null

  return (
    <NotificationProviderWrapper userId={user.id}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:shrink-0">
          <Sidebar workspaceName={workspaceName} role={role} userEmail={userEmail} userName={userName} />
        </div>

        {/* Mobile sidebar drawer */}
        <MobileSidebar workspaceName={workspaceName} role={role} userEmail={userEmail} userName={userName} />

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header user={user} role={role} workspaceName={workspaceName} />

          <main className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-5 lg:px-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </NotificationProviderWrapper>
  )
}
