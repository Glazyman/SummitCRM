import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { OverdueFollowUpsWidget } from '@/components/notifications/overdue-followups-widget'
import { RepPerformancePanel } from '@/components/dashboard/rep-performance'
import { MyActivityPanel }     from '@/components/dashboard/my-activity'
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
  const gamePlan = member && user && role === 'rep'
    ? await getRepGamePlan(supabase, member.workspace_id, user.id)
    : null
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
            title="Calls Today"
            value={`${formatNumber(metrics.callsToday)} / ${formatNumber(metrics.dailyCallTarget)}`}
            description="daily call target"
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
      {role === 'rep' && gamePlan && <TodayGamePlan plan={gamePlan} />}

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

type GamePlanLead = {
  leadId:    string
  name:      string
  company:   string | null
  dueAt?:    string
  createdAt?: string
  callbackAt?: string
}

type RepGamePlan = {
  followUpsDueToday: GamePlanLead[]
  newLeadsFirstContact: GamePlanLead[]
  callbacksRequested: GamePlanLead[]
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
    overrideResult,
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
      .from('rep_call_targets')
      .select('daily_target')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  // Calls logged this week (best-effort — join through leads)
  let callsLogged = 0
  let callsToday = 0
  try {
    const { count } = await supabase
      .from('activities')
      .select('id, leads!inner(workspace_id)', { count: 'exact', head: true })
      .eq('leads.workspace_id', workspaceId)
      .eq('type', 'call_logged')
      .gte('created_at', weekAgo.toISOString())
    callsLogged = count ?? 0
  } catch {}

  try {
    const { count } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('logged_by', userId)
      .gte('called_at', startOfToday.toISOString())
    callsToday = count ?? 0
  } catch {}

  const workspaceDefault = Number((workspaceResult.data as { settings?: Record<string, unknown> } | null)?.settings?.daily_call_target)
  const overrideTarget = Number((overrideResult.data as { daily_target?: number } | null)?.daily_target)
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

function leadName(first: string | null, last: string | null, email: string) {
  return [first, last].filter(Boolean).join(' ') || email
}

function formatRelativeDay(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

async function getRepGamePlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string
): Promise<RepGamePlan> {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  const [followUpsResult, newLeadsResult, callbacksResult] = await Promise.all([
    supabase
      .from('follow_ups')
      .select('lead_id, due_at, leads!inner(first_name,last_name,email,company)')
      .eq('workspace_id', workspaceId)
      .eq('assigned_to', userId)
      .is('completed_at', null)
      .gte('due_at', start.toISOString())
      .lte('due_at', end.toISOString())
      .order('due_at', { ascending: true })
      .limit(8),
    supabase
      .from('leads')
      .select('id, first_name, last_name, email, company, created_at')
      .eq('workspace_id', workspaceId)
      .eq('assigned_to', userId)
      .eq('status', 'new')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(8),
    supabase
      .from('call_logs')
      .select('lead_id, called_at, leads!inner(first_name,last_name,email,company,assigned_to)')
      .eq('workspace_id', workspaceId)
      .eq('outcome', 'callback_requested')
      .eq('leads.assigned_to', userId)
      .order('called_at', { ascending: false })
      .limit(40),
  ])

  const followUpsDueToday = ((followUpsResult.data ?? []) as Array<{
    lead_id: string
    due_at: string
    leads: { first_name: string | null; last_name: string | null; email: string; company: string | null } | null
  }>).map((r) => ({
    leadId: r.lead_id,
    name: leadName(r.leads?.first_name ?? null, r.leads?.last_name ?? null, r.leads?.email ?? 'Lead'),
    company: r.leads?.company ?? null,
    dueAt: r.due_at,
  }))

  const newLeadsFirstContact = ((newLeadsResult.data ?? []) as Array<{
    id: string
    first_name: string | null
    last_name: string | null
    email: string
    company: string | null
    created_at: string
  }>).map((r) => ({
    leadId: r.id,
    name: leadName(r.first_name, r.last_name, r.email),
    company: r.company,
    createdAt: r.created_at,
  }))

  const callbackRows = (callbacksResult.data ?? []) as Array<{
    lead_id: string
    called_at: string
    leads: { first_name: string | null; last_name: string | null; email: string; company: string | null } | null
  }>
  const seen = new Set<string>()
  const callbacksRequested: GamePlanLead[] = []
  for (const row of callbackRows) {
    if (seen.has(row.lead_id)) continue
    seen.add(row.lead_id)
    callbacksRequested.push({
      leadId: row.lead_id,
      name: leadName(row.leads?.first_name ?? null, row.leads?.last_name ?? null, row.leads?.email ?? 'Lead'),
      company: row.leads?.company ?? null,
      callbackAt: row.called_at,
    })
    if (callbacksRequested.length >= 8) break
  }

  return { followUpsDueToday, newLeadsFirstContact, callbacksRequested }
}

function TodayGamePlan({ plan }: { plan: RepGamePlan }) {
  const sections = [
    { title: 'Follow-ups Due Today', rows: plan.followUpsDueToday, meta: (r: GamePlanLead) => r.dueAt ? new Date(r.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '' },
    { title: 'New Leads To First-Contact', rows: plan.newLeadsFirstContact, meta: (r: GamePlanLead) => `added ${formatRelativeDay(r.createdAt)}` },
    { title: 'Callbacks Requested', rows: plan.callbacksRequested, meta: (r: GamePlanLead) => `requested ${formatRelativeDay(r.callbackAt)}` },
  ]

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Today&apos;s Game Plan</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {sections.map((section) => (
            <div key={section.title} className="rounded-xl border border-border">
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-medium">{section.title}</p>
                <p className="text-xs text-muted-foreground">{section.rows.length} leads</p>
              </div>
              <div className="divide-y divide-border">
                {section.rows.length === 0 ? (
                  <div className="px-3 py-6 text-sm text-muted-foreground">No items</div>
                ) : section.rows.map((row) => (
                  <Link key={`${section.title}-${row.leadId}`} href={`/leads/${row.leadId}`} className="block px-3 py-2 hover:bg-muted/40">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.company ?? 'No company'} · {section.meta(row)}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
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
