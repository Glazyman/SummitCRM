import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OverdueFollowUpsWidget } from '@/components/notifications/overdue-followups-widget'
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

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          {getGreeting()}, {firstName ?? 'there'}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {role === 'viewer'
            ? "Here's a read-only view of your workspace."
            : "Here's what's happening in your workspace today."}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Leads"
          value="—"
          description="in workspace"
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Emails Sent"
          value="—"
          description="this week"
          icon={Send}
          color="green"
        />
        <StatCard
          title="Open Rate"
          value="—"
          description="last 30 days"
          icon={BarChart2}
          color="purple"
        />
        <StatCard
          title="Unread"
          value="—"
          description="notifications"
          icon={Bell}
          color="amber"
        />
      </div>

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
                title="Add a sending account"
                description="Connect a Resend API key or SMTP account to start sending emails."
                href="/settings/sending-accounts"
                done={false}
              />
              <SetupStep
                number={2}
                title="Import your first leads"
                description="Upload a CSV file to bring your prospects into the CRM."
                href="/leads"
                done={false}
              />
              <SetupStep
                number={3}
                title="Invite your team"
                description="Add reps and managers to your workspace."
                href="/settings/team"
                done={false}
              />
              <SetupStep
                number={4}
                title="Create your first campaign"
                description="Set up a multi-step email sequence for your leads."
                href="/campaigns"
                done={false}
              />
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Quick actions — for reps */}
      {role === 'rep' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <QuickActionCard
            title="My Leads"
            description="View and manage your assigned leads."
            href="/leads"
            icon={Users}
            color="blue"
          />
          <QuickActionCard
            title="Notifications"
            description="Check replies, bounces, and follow-up reminders."
            href="/notifications"
            icon={Bell}
            color="amber"
          />
        </div>
      )}

      {/* Manager quick actions */}
      {role === 'manager' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <QuickActionCard
            title="All Leads"
            description="View all workspace leads and activity."
            href="/leads"
            icon={Users}
            color="blue"
          />
          <QuickActionCard
            title="Campaigns"
            description="Create and manage bulk email campaigns."
            href="/campaigns"
            icon={Send}
            color="green"
          />
          <QuickActionCard
            title="Analytics"
            description="Track team performance and email metrics."
            href="/analytics"
            icon={BarChart2}
            color="purple"
          />
        </div>
      )}

      {/* Overdue follow-ups widget — visible to all roles with assignments */}
      {role !== 'viewer' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <OverdueFollowUpsWidget />
          <QuickActionCard
            title="Notifications"
            description="Replies, bounces, quota alerts, and follow-up reminders."
            href="/notifications"
            icon={Bell}
            color="amber"
          />
        </div>
      )}
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

// ── Sub-components ────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string
  value: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'purple' | 'amber'
}) {
  return (
    <Card>
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
    </Card>
  )
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
    <li className="flex items-start gap-4">
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
