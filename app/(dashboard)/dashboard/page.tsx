import type { Metadata } from 'next'
import Link from 'next/link'
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

  // Fetch role for contextual dashboard content
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role, workspace_id')
    .eq('user_id', user?.id ?? '')
    .eq('is_active', true)
    .single() as { data: { role: WorkspaceRole; workspace_id: string } | null; error: unknown }

  const role = member?.role
  const metrics = member && user
    ? await getDashboardMetrics(supabase, member.workspace_id, user.id, member.role)
    : emptyDashboardMetrics()
  const totalLeadsDescription =
    role === 'rep' || false ? 'assigned to you' : 'in workspace'

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Dashboard</h1>
      </div>

      {/* Stats grid */}
      {role === 'rep' ? (
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
            title="Interested"
            value={formatNumber(metrics.interestedLeads)}
            description="expressed interest"
            icon={TrendingUp}
            color="green"
          />
          <StatCard
            title="Calls Logged"
            value={formatNumber(metrics.callsLogged)}
            description="this week"
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
      )}

      {/* Rep: my activity breakdown */}
      {role === 'rep' && <MyActivityPanel />}
      {role === 'rep' && <CallsTodayCard />}

      {/* Admin: rep performance table */}
      {(role === 'admin' || role === 'super_admin') && <RepPerformancePanel />}

      {/* Overdue follow-ups widget */}
      <OverdueFollowUpsWidget />
      {role === 'rep' && <QuickLogCallWidget />}
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
  weekAgo.setDate(weekAgo.getDate() - 7)
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

  const [
    leadsResult,
    newLeadsResult,
    interestedResult,
    followUpsDueResult,
    workspaceResult,
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
  ])

  // Calls logged this week (call logs + legacy bulk status-change fallback)
  let callsLogged = 0
  let callsToday = 0
  try {
    const [callsRes, statusActivitiesRes] = await Promise.all([
      supabase
        .from('call_logs')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .gte('called_at', weekAgo.toISOString()),
      supabase
        .from('activity_logs')
        .select('metadata')
        .eq('workspace_id', workspaceId)
        .eq('type', 'lead_status_changed')
        .gte('created_at', weekAgo.toISOString()),
    ])

    const statusToCall = new Set(['called', 'voicemail', 'no_answer', 'wrong_number', 'sold_already'])
    const synthetic = ((statusActivitiesRes.data ?? []) as Array<{ metadata: Record<string, unknown> | null }>)
      .filter((row) => row.metadata?.bulk === true)
      .filter((row) => typeof row.metadata?.to === 'string' && statusToCall.has(row.metadata.to as string))
      .length

    callsLogged = (callsRes.count ?? 0) + synthetic
  } catch {}

  try {
    // "Calls today" tracks UNIQUE leads reached — a rep can dial the same
    // lead multiple times in a day and that shouldn't double-count against
    // the target.
    const { data } = await (supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: number | null }>
    }).rpc('get_unique_leads_called', {
      p_workspace_id: workspaceId,
      p_user_id:      userId,
      p_since:        startOfToday.toISOString(),
    })
    callsToday = Number(data ?? 0)
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
