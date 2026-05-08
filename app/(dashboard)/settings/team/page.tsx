import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Users, UserPlus, Shield, Mail } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { WorkspaceRole } from '@/types/database'

export const metadata: Metadata = { title: 'Team — Summits CRM' }

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  manager:     'Manager',
  rep:         'Rep',
  viewer:      'Viewer',
}

const ROLE_COLORS: Record<WorkspaceRole, string> = {
  super_admin: 'bg-secondary text-foreground',
  admin:       'bg-secondary text-foreground',
  manager:     'bg-secondary text-foreground',
  rep:         'bg-muted text-muted-foreground',
  viewer:      'bg-muted/50 text-muted-foreground',
}

interface Member {
  user_id:   string
  role:      WorkspaceRole
  is_active: boolean
  joined_at: string | null
  email?:    string
  full_name?: string
}

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check role — only admin+ can view team management
  const { data: currentMember } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: WorkspaceRole } | null; error: unknown }

  if (!currentMember || !['admin', 'super_admin', 'manager'].includes(currentMember.role)) {
    redirect('/settings')
  }

  const isAdmin = ['admin', 'super_admin'].includes(currentMember.role)

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5" /> Team Members
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your workspace team and their access levels.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium">
            <UserPlus className="w-4 h-4" />
            Invite Member (coming soon)
          </div>
        )}
      </div>

      {/* Role legend */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm">Role Permissions</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { role: 'admin',   desc: 'Full workspace access, invite/remove members' },
              { role: 'manager', desc: 'View all leads, manage campaigns, view analytics' },
              { role: 'rep',     desc: 'View assigned leads, send emails, add notes' },
              { role: 'viewer',  desc: 'Read-only access to workspace data' },
            ].map(({ role, desc }) => (
              <div key={role} className="flex items-start gap-2">
                <span className={cn(
                  'mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide flex-shrink-0',
                  ROLE_COLORS[role as WorkspaceRole]
                )}>
                  {ROLE_LABELS[role as WorkspaceRole]}
                </span>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Members list placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace Members</CardTitle>
          <CardDescription>
            Team member management with invite flows will be available in the next release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Mail className="w-6 h-6" />
            </div>
            <p className="text-sm text-center">
              Member invites via email are coming soon.<br />
              Contact support to add team members manually.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
