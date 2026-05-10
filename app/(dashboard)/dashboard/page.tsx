import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OverdueFollowUpsWidget } from '@/components/notifications/overdue-followups-widget'
import { RepPerformancePanel } from '@/components/dashboard/rep-performance'
import { MyActivityPanel }     from '@/components/dashboard/my-activity'
import { Users, Send, BarChart2, Bell, ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import type { WorkspaceRole } from '@/types/database'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const fullName = user?.user_metadata?.full_name as string | undefined
  const firstName = fullName?.split(' ')[0]

  // Fetch role for contextual dashboard content
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role, workspace_id')
    .eq('user_id', user?.id ?? '')
    .eq('is_active', true)
    .single() as { data: { role: WorkspaceRole; workspace_id: string } | null; error: unknown }

  const role = member?.role
  const metrics = member && user
    ? await getDashboardMetrics(supabase, member.workspace_id, user.id, role)
    : emptyDashboardMetrics()
  const totalLeadsDescription =
    role === 'rep' || false ? 'assigned to you' : 'in workspace'

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          {getGreeting()}, {firstName ?? 'there'}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {false
            ? "Here's a read-only view of your workspace."
            : "Here's what's happening in your workspace today."}
        </p>
      </div>

      {/* Stats grid */}
      {role === 'rep' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Total Leads"
            value={formatNumber(metrics.totalLeads)}
            description="assigned to you"
            icon={Users}
            color="blue"
            href="/leads"
          />
          <StatCard
            title="New Leads"
            value={formatNumber(metrics.newLeads)}
            description="not yet contacted"
            icon={Users}
            color="green"
            href="/leads?status=new"
          />
          <StatCard
            title="Follow-ups Due"
            value={formatNumber(metrics.followUpsDue)}
            description="pending today"
            icon={Bell}
            color="amber"
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Leads"
            value={formatNumber(metrics.totalLeads)}
            description={totalLeadsDescription}
            icon={Users}
            color="blue"
          />
          <StatCard
            title="Emails Sent"
            value={formatNumber(metrics.emailsSentThisWeek)}
            description="this week"
            icon={Send}
            color="green"
          />
          <StatCard
            title="Open Rate"
            value={formatPercent(metrics.openRateLast30Days)}
            description="last 30 days"
            icon={BarChart2}
            color="purple"
          />
          <StatCard
            title="Unread"
            value={formatNumber(metrics.unreadNotifications)}
            description="notifications"
            icon={Bell}
            color="amber"
          />
        </div>
      )}

      {/* Getting started checklist — only show for admin+ */}
      {(role === 'admin' || role === 'super_admin') && (
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>
              Complete these steps to set up your workspace for your team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              <SetupStep
                number={1}
                title="Import your first leads"
                description="Upload a CSV file to bring your prospects into the CRM."
                href="/leads"
                done={metrics.setup.hasLeads}
              />
              <SetupStep
                number={2}
                title="Invite your team"
                description="Add reps and admins to your workspace."
                href="/settings/team"
                done={metrics.setup.hasTeamMembers}
              />
              <SetupStep
                number={3}
                title="Assign leads to reps"
                description="Go to a lead and assign it to a rep so they can start calling."
                href="/leads"
                done={false}
              />
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Rep: my activity breakdown */}
      {role === 'rep' && <MyActivityPanel />}

      {/* Admin: rep performance table */}
      {(role === 'admin' || role === 'super_admin') && <RepPerformancePanel />}

      {/* Overdue follow-ups widget */}
      <OverdueFollowUpsWidget />
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

type DashboardMetrics = {
  totalLeads: number
  newLeads: number
  emailsSentThisWeek: number
  openRateLast30Days: number
  unreadNotifications: number
  followUpsDue: number
  setup: {
    hasLeads: boolean
    hasTeamMembers: boolean
  }
}

function emptyDashboardMetrics(): DashboardMetrics {
  return {
    totalLeads: 0,
    newLeads: 0,
    emailsSentThisWeek: 0,
    openRateLast30Days: 0,
    unreadNotifications: 0,
    followUpsDue: 0,
    setup: {
      hasLeads: false,
      hasTeamMembers: false,
    },
  }
}

async function getDashboardMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole | undefined
): Promise<DashboardMetrics> {
  const now = new Date()

  const [
    leadsResult,
    newLeadsResult,
    followUpsDueResult,
    membersResult,
  ] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('assigned_to', userId)
      .eq('status', 'new')
      .is('deleted_at', null),
    supabase
      .from('follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .is('completed_at', null)
      .lte('due_at', now.toISOString()),
    supabase
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('is_active', true),
  ])

  const canManageSetup = role === 'admin' || role === 'super_admin'

  return {
    totalLeads: leadsResult.count ?? 0,
    newLeads: newLeadsResult.count ?? 0,
    emailsSentThisWeek: 0,
    openRateLast30Days: 0,
    unreadNotifications: 0,
    followUpsDue: followUpsDueResult.count ?? 0,
    setup: {
      hasLeads: (leadsResult.count ?? 0) > 0,
      hasTeamMembers: canManageSetup && (membersResult.count ?? 0) > 1,
    },
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercent(value: number) {
  return `${value}%`
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  href,
}: {
  title: string
  value: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'purple' | 'amber'
  href?: string
}) {
  const content = (
    <CardContent className="pt-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-semibold tracking-[-0.03em]">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="shrink-0 rounded-xl border border-border bg-secondary p-3 text-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href}>
        <Card className="transition-colors hover:border-foreground/30 hover:bg-secondary/40 cursor-pointer">
          {content}
        </Card>
      </Link>
    )
  }

  return <Card>{content}</Card>
}

function SetupStep({
  number,
  title,
  description,
  href,
  done,
}: {
  number: number
  title: string
  description: string
  href: string
  done: boolean
}) {
  return (
    <li className="flex items-start gap-4" aria-label={`Step ${number}: ${title}`}>
      <div className="mt-0.5 shrink-0">
        {done
          ? <CheckCircle2 className="h-5 w-5 text-foreground" />
          : <Circle className="h-5 w-5 text-muted-foreground/40" />
        }
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className={`text-sm font-medium hover:text-primary hover:underline ${done ? 'line-through text-muted-foreground' : ''}`}
        >
          {title}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {!done && (
        <Link href={href} className="shrink-0 text-muted-foreground hover:text-foreground" aria-hidden="true">
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </li>
  )
}

function QuickActionCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'purple' | 'amber'
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-foreground/30 hover:bg-secondary/40">
        <CardContent className="pt-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-xl border border-border bg-secondary p-3 text-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
