import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { OverdueFollowUpsWidget } from '@/components/notifications/overdue-followups-widget'
import { RepPerformancePanel } from '@/components/dashboard/rep-performance'
import { MyActivityPanel }     from '@/components/dashboard/my-activity'
import { CallsTodayCard }      from '@/components/dashboard/calls-today-card'
import { QuickLogCallWidget }  from '@/components/dashboard/quick-log-call-widget'
import { Users, PhoneCall, TrendingUp, Bell } from 'lucide-react'
import type { WorkspaceRole } from '@/types/database'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch role for contextual dashboard content. Cheap query — needed
  // to decide which widgets to render, so kept in the page shell.
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role, workspace_id')
    .eq('user_id', user?.id ?? '')
    .eq('is_active', true)
    .single() as { data: { role: WorkspaceRole; workspace_id: string } | null; error: unknown }

  const role = member?.role

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Dashboard</h1>
      </div>

      {/* Stats grid — streamed. Skeleton appears instantly with the
          page shell; real numbers stream in once getDashboardMetrics
          resolves (the slow part). */}
      <Suspense fallback={<StatsRowSkeleton />}>
        {member && user ? (
          <DashboardStats
            workspaceId={member.workspace_id}
            userId={user.id}
            role={member.role}
          />
        ) : (
          <StatsRowSkeleton />
        )}
      </Suspense>

      {/* Already client components — fetch their own data after mount. */}
      {role === 'rep' && <MyActivityPanel />}
      {role === 'rep' && <CallsTodayCard />}
      {(role === 'admin' || role === 'super_admin') && <RepPerformancePanel />}

      <OverdueFollowUpsWidget />
      {role === 'rep' && <QuickLogCallWidget />}
    </div>
  )
}

/** Async server component — runs the slow metrics query in isolation. */
async function DashboardStats({
  workspaceId, userId, role,
}: {
  workspaceId: string; userId: string; role: WorkspaceRole
}) {
  const supabase = await createClient()
  const metrics  = await getDashboardMetrics(supabase, workspaceId, userId, role)
  const totalLeadsDescription = role === 'rep' ? 'assigned to you' : 'in workspace'

  if (role === 'rep') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <StatCard
          title="Leads Called Today"
          value={`${formatNumber(metrics.callsToday)} / ${formatNumber(metrics.dailyCallTarget)}`}
          description="unique leads vs. target"
          icon={PhoneCall}
          color="purple"
        />
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Leads"
        value={formatNumber(metrics.totalLeads)}
        description={totalLeadsDescription}
        icon={Users}
        color="blue"
      />
      <StatCard
        title="Interested"
        value={formatNumber(metrics.interestedLeads)}
        description="expressed interest"
        icon={TrendingUp}
        color="green"
      />
      <StatCard
        title="Calls Logged"
        value={formatNumber(metrics.callsLogged)}
        description="last 30 days"
        icon={PhoneCall}
        color="purple"
      />
      <StatCard
        title="Follow-ups Due"
        value={formatNumber(metrics.followUpsDue)}
        description="pending today"
        icon={Bell}
        color="amber"
      />
    </div>
  )
}

/** Skeleton used by the Suspense fallback for the stats row. */
function StatsRowSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card shadow-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-7 w-7 rounded-lg bg-muted" />
          </div>
          <div className="h-8 w-24 rounded bg-muted" />
          <div className="h-3 w-28 rounded bg-muted/70" />
        </div>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

type DashboardMetrics = {
  totalLeads:       number
  newLeads:         number
  interestedLeads:  number
  callsLogged:      number
  callsToday:       number
  dailyCallTarget:  number
  unreadNotifications: number
  followUpsDue:     number
}

function emptyDashboardMetrics(): DashboardMetrics {
  return {
    totalLeads:          0,
    newLeads:            0,
    interestedLeads:     0,
    callsLogged:         0,
    callsToday:          0,
    dailyCallTarget:     100,
    unreadNotifications: 0,
    followUpsDue:        0,
  }
}

async function getDashboardMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
  role: string
): Promise<DashboardMetrics> {
  const now = new Date()

  // End of today — so follow-ups scheduled for any time today are included
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 30)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  const isAdmin = ['admin', 'super_admin'].includes(role)

  // Follow-ups query: admins see all workspace follow-ups, reps see their own
  const followUpsBase = supabase
    .from('follow_ups')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('completed_at', null)
    .lte('due_at', endOfToday.toISOString())

  const followUpsDueQuery = isAdmin
    ? followUpsBase
    : followUpsBase.eq('assigned_to', userId)

  // All independent queries fan out in ONE round-trip. Previously the
  // dashboard did three sequential awaits, each adding ~100ms of network
  // overhead. Nothing in this batch depends on anything else in it.
  const supabaseAny = supabase as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }>
  }
  const [
    leadsResult,
    newLeadsResult,
    interestedResult,
    followUpsDueResult,
    workspaceResult,
    callsRes,
    uniqueLeadsRes,
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
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('interest_status', 'interested')
      .is('deleted_at', null),
    followUpsDueQuery,
    supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single(),
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('called_at', weekAgo.toISOString()),
    // Unique leads called today (vs daily target).
    supabaseAny.rpc('get_unique_leads_called', {
      p_workspace_id: workspaceId,
      p_user_id:      userId,
      p_since:        startOfToday.toISOString(),
    }),
  ])

  // Calls logged this week — all call paths write to call_logs, so the
  // HEAD count is the single source of truth. The old activity_logs synthetic
  // count was removed because it double-counted bulk status changes.
  let callsLogged = 0
  let callsToday  = 0
  try {
    callsLogged = (callsRes as unknown as { count: number | null }).count ?? 0
  } catch {}

  try {
    callsToday = Number((uniqueLeadsRes as { data: number | null }).data ?? 0)
  } catch {}

  const workspaceDefault = Number((workspaceResult.data as { settings?: Record<string, unknown> } | null)?.settings?.daily_call_target)
  const overrideMap = (((workspaceResult.data as { settings?: Record<string, unknown> } | null)?.settings?.rep_daily_call_targets ?? {}) as Record<string, unknown>)
  const overrideTarget = Number(overrideMap[userId])
  const defaultTarget = Number.isFinite(workspaceDefault) && workspaceDefault > 0 ? Math.floor(workspaceDefault) : 100
  const dailyCallTarget = Number.isFinite(overrideTarget) && overrideTarget > 0 ? Math.floor(overrideTarget) : defaultTarget

  return {
    totalLeads:          leadsResult.count     ?? 0,
    newLeads:            newLeadsResult.count   ?? 0,
    interestedLeads:     interestedResult.count ?? 0,
    callsLogged,
    callsToday,
    dailyCallTarget,
    unreadNotifications: 0,
    followUpsDue:        followUpsDueResult.count ?? 0,
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
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
