import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { MobileSidebar } from '@/components/layout/mobile-sidebar'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'
import { NotificationProviderWrapper } from '@/components/notifications/notification-provider-wrapper'

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

  // The effective actor — the impersonated teammate when an admin is "viewing
  // as" someone, otherwise the real user. All nav/scoping keys off this.
  const actor = await getActor()

  // No active workspace membership — access has been revoked. Boot to login.
  if (!actor) {
    redirect('/login')
  }

  // Workspace name for the sidebar/header (impersonation stays within the
  // admin's own workspace, so this is unchanged either way).
  const { data: ws } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', actor.workspaceId)
    .single() as { data: { name: string } | null }

  const workspaceName = ws?.name ?? null
  // Effective role drives which nav/widgets show, so an admin viewing-as a rep
  // sees the rep's screen.
  const role = actor.role
  // While impersonating, surface the teammate's identity in the header/avatar.
  const userName = actor.isImpersonating
    ? actor.impersonatedName
    : (user.user_metadata?.full_name as string | undefined ?? null)
  const userEmail = actor.isImpersonating ? actor.impersonatedEmail : (user.email ?? null)

  // Notifications stay the real admin's personal inbox even while viewing-as a
  // teammate (they're the human's alerts, and are RLS-scoped to auth.uid()).
  // Everything else on the page follows the effective actor.
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
          {actor.isImpersonating && (
            <ImpersonationBanner name={actor.impersonatedName} role={actor.role} />
          )}
          <Header
            user={user}
            role={role}
            workspaceName={workspaceName}
            realRole={actor.realRole}
            isImpersonating={actor.isImpersonating}
            impersonatedName={actor.impersonatedName}
          />

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
