import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'
import { resolveDailyCallTarget } from '@/lib/call-targets'
import { Card, CardContent } from '@/components/ui/card'
import { OverdueFollowUpsWidget } from '@/components/notifications/overdue-followups-widget'
import { RepPerformancePanel } from '@/components/dashboard/rep-performance'
import { MyActivityPanel }     from '@/components/dashboard/my-activity'
import { CallsTodayCard }      from '@/components/dashboard/calls-today-card'
import { Users, PhoneCall, TrendingUp, Bell } from 'lucide-react'
import type { WorkspaceRole } from '@/types/database'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  // Effective actor: impersonated teammate when an admin is "viewing as"
  // someone, else the real user. Widget selection + metric scoping key off this,
  // so an admin viewing-as a rep sees the rep dashboard.
  const actor = await getActor()
  const role = actor?.role

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
        {actor ? (
          <DashboardStats
            workspaceId={actor.workspaceId}
            userId={actor.userId}
            role={actor.role}
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

  if (role === 'rep') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Leads"
          value={`${formatNumber(metrics.leadsContacted)} / ${formatNumber(metrics.totalLeads)}`}
          description="contacted / assigned"
          icon={Users}
          color="blue"
          href="/leads"
        />
        <StatCard
          title="Deals in Pipeline"
          value={formatNumber(metrics.dealsInPipeline)}
          description="your deals"
          icon={TrendingUp}
          color="green"
          href="/pipeline"
        />
        <StatCard
          title="Tasks Due"
          value={formatNumber(metrics.followUpsDue)}
          description="pending today"
          icon={Bell}
          color="amber"
        />
        <StatCard
          title="Leads Called Today"
          value={`${formatNumber(metrics.callsToday)} / ${formatNumber(metrics.dailyCallTarget)}`}
          description="of your daily target"
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
        value={`${formatNumber(metrics.leadsContacted)} / ${formatNumber(metrics.totalLeads)}`}
        description="contacted / total"
        icon={Users}
        color="blue"
        href="/leads"
      />
      <StatCard
        title="Deals in Pipeline"
        value={formatNumber(metrics.dealsInPipeline)}
        description="across all reps"
        icon={TrendingUp}
        color="green"
        href="/pipeline"
      />
      <StatCard
        title="Leads Called"
        value={formatNumber(metrics.leadsCalled)}
        description="last 30 days · once per lead"
        icon={PhoneCall}
        color="purple"
      />
      <StatCard
        title="Tasks Due"
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
  leadsContacted:   number
  dealsInPipeline:  number
  leadsCalled:      number
  callsToday:       number
  dailyCallTarget:  number
  unreadNotifications: number
  followUpsDue:     number
}

function emptyDashboardMetrics(): DashboardMetrics {
  return {
    totalLeads:          0,
    leadsContacted:      0,
    dealsInPipeline:     0,
    leadsCalled:         0,
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

  // Total leads: admins see the whole workspace, reps see only their assigned.
  let totalLeadsQuery = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
  if (!isAdmin) totalLeadsQuery = totalLeadsQuery.eq('assigned_to', userId)

  // Deals currently in the pipeline (any stage). Admins see all reps' deals,
  // reps see only their own.
  let dealsInPipelineQuery = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .not('pipeline_stage_id', 'is', null)
    .is('deleted_at', null)
  if (!isAdmin) dealsInPipelineQuery = dealsInPipelineQuery.eq('assigned_to', userId)

  const supabaseAny = supabase as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }>
  }

  // Leads contacted: admins = every lead contacted by anyone (last_contacted_at
  // set), all-time; reps = unique leads THEY called all-time (via RPC).
  const contactedQuery = isAdmin
    ? supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .not('last_contacted_at', 'is', null)
        .is('deleted_at', null)
    : supabaseAny.rpc('get_unique_leads_called', {
        p_workspace_id: workspaceId,
        p_user_id:      userId,
        p_since:        new Date(0).toISOString(),
      })
  const [
    leadsResult,
    contactedRes,
    followUpsDueResult,
    workspaceResult,
    callsRes,
    uniqueLeadsRes,
    dealsRes,
  ] = await Promise.all([
    totalLeadsQuery,
    contactedQuery,
    followUpsDueQuery,
    supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single(),
    // Leads called in the last 30 days — counted ONCE per lead (a lead called
    // multiple times counts once). `last_contacted_at` is a per-lead field.
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('last_contacted_at', weekAgo.toISOString())
      .is('deleted_at', null),
    // Unique leads called today (vs daily target).
    supabaseAny.rpc('get_unique_leads_called', {
      p_workspace_id: workspaceId,
      p_user_id:      userId,
      p_since:        startOfToday.toISOString(),
    }),
    dealsInPipelineQuery,
  ])

  // Leads called in the last 30 days (unique — one per lead).
  let leadsCalled = 0
  let callsToday  = 0
  try {
    leadsCalled = (callsRes as unknown as { count: number | null }).count ?? 0
  } catch {}

  try {
    callsToday = Number((uniqueLeadsRes as { data: number | null }).data ?? 0)
  } catch {}

  const dailyCallTarget = resolveDailyCallTarget(
    (workspaceResult.data as { settings?: Record<string, unknown> } | null)?.settings,
    userId,
  )

  return {
    totalLeads:          leadsResult.count     ?? 0,
    // admins: count query → .count; reps: RPC → .data
    leadsContacted:      isAdmin
      ? ((contactedRes as { count: number | null }).count ?? 0)
      : Number((contactedRes as { data: number | null }).data ?? 0),
    dealsInPipeline:     dealsRes.count ?? 0,
    leadsCalled,
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
