'use client'

import * as React from 'react'
import { Users, UserPlus, Shield, Mail, MoreHorizontal, Check, X, Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { WorkspaceRole } from '@/types/database'

// ── Types ─────────────────────────────────────────────────────────────────
interface Member {
  id:        string
  user_id:   string
  role:      WorkspaceRole
  is_active: boolean
  joined_at: string | null
  email:     string | null
  full_name: string | null
  is_me:     boolean
}

interface PendingInvite {
  id:          string
  email:       string
  role:        string
  expires_at:  string
  created_at:  string
  accepted_at: string | null
}

interface Props {
  workspaceId:        string
  currentUserId:      string
  isAdmin:            boolean
  pendingInvitations: PendingInvite[]
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  manager:     'Manager',
  rep:         'Rep',
  viewer:      'Viewer',
}

const ROLE_COLORS: Record<WorkspaceRole, string> = {
  super_admin: 'bg-primary/10 text-primary border-primary/20',
  admin:       'bg-primary/10 text-primary border-primary/20',
  manager:     'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400',
  rep:         'bg-muted text-muted-foreground border-border',
  viewer:      'bg-muted/50 text-muted-foreground border-border',
}

// ── Invite form ────────────────────────────────────────────────────────────
function InviteForm({ onInvite }: { onInvite: (email: string, role: WorkspaceRole) => Promise<void> }) {
  const [email, setEmail]     = React.useState('')
  const [role, setRole]       = React.useState<WorkspaceRole>('rep')
  const [submitting, setSub]  = React.useState(false)
  const [error, setError]     = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSuccess(null)
    if (!email.trim()) return
    setSub(true)
    try {
      await onInvite(email.trim(), role)
      setSuccess(`Invitation sent to ${email.trim()}`)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setSub(false)
    }
  }

  const availableRoles: { value: WorkspaceRole; label: string; desc: string }[] = [
    { value: 'rep',     label: 'Rep',     desc: 'Can view assigned leads, send emails' },
    { value: 'manager', label: 'Manager', desc: 'View all leads, manage campaigns' },
    { value: 'admin',   label: 'Admin',   desc: 'Full access, manage team' },
    { value: 'viewer',  label: 'Viewer',  desc: 'Read-only access' },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400 flex items-center gap-2">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="sm:w-40 space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
            className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {availableRoles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Role description */}
      <p className="text-xs text-muted-foreground">
        {availableRoles.find((r) => r.value === role)?.desc}
      </p>

      <Button type="submit" disabled={submitting || !email} className="gap-1.5">
        <Mail className="h-4 w-4" />
        {submitting ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function TeamSettingsClient({
  isAdmin,
  pendingInvitations: initialInvites,
}: Props) {
  const [members, setMembers]   = React.useState<Member[]>([])
  const [invites, setInvites]   = React.useState<PendingInvite[]>(initialInvites)
  const [loading, setLoading]   = React.useState(true)
  const [showInvite, setShowInvite] = React.useState(false)

  // Load members on mount
  React.useEffect(() => {
    fetch('/api/team/members')
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleInvite(email: string, role: WorkspaceRole) {
    const res = await fetch('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setInvites((prev) => [
      {
        id:          data.invitation.id,
        email,
        role,
        expires_at:  data.invitation.expires_at,
        created_at:  new Date().toISOString(),
        accepted_at: null,
      },
      ...prev,
    ])
  }

  async function handleRoleChange(memberId: string, role: WorkspaceRole) {
    const res = await fetch('/api/team/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, role }),
    })
    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => m.id === memberId ? { ...m, role } : m)
      )
    }
  }

  async function handleDeactivate(memberId: string) {
    if (!confirm('Remove this member from the workspace?')) return
    const res = await fetch('/api/team/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, is_active: false }),
    })
    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => m.id === memberId ? { ...m, is_active: false } : m)
      )
    }
  }

  const activeMembers   = members.filter((m) => m.is_active)
  const inactiveMembers = members.filter((m) => !m.is_active)

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5" /> Team Members
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage workspace members and their access levels.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setShowInvite((v) => !v)}
            className="gap-1.5"
            variant={showInvite ? 'outline' : 'default'}
          >
            {showInvite ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {showInvite ? 'Cancel' : 'Invite member'}
          </Button>
        )}
      </div>

      {/* Invite form */}
      {isAdmin && showInvite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4" /> Invite a team member
            </CardTitle>
            <CardDescription>
              They&apos;ll receive an email with a link to create their account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm onInvite={handleInvite} />
          </CardContent>
        </Card>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm">Pending Invitations</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide border',
                    ROLE_COLORS[invite.role as WorkspaceRole] ?? 'bg-muted text-muted-foreground border-border'
                  )}>
                    {ROLE_LABELS[invite.role as WorkspaceRole] ?? invite.role}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active members */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm">
                Active Members ({activeMembers.length})
              </CardTitle>
            </div>
            <button
              onClick={() => {
                setLoading(true)
                fetch('/api/team/members')
                  .then((r) => r.json())
                  .then((d) => setMembers(d.members ?? []))
                  .finally(() => setLoading(false))
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading members…
            </div>
          ) : activeMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Users className="w-8 h-8 opacity-30" />
              <p className="text-sm">No members found</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activeMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                      {(member.full_name ?? member.email ?? '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {member.full_name ?? member.email ?? 'Unknown'}
                        {member.is_me && (
                          <span className="ml-2 text-[10px] text-muted-foreground">(you)</span>
                        )}
                      </p>
                      {member.full_name && (
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAdmin && !member.is_me ? (
                      <>
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as WorkspaceRole)}
                          className="h-7 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {(['viewer', 'rep', 'manager', 'admin'] as WorkspaceRole[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleDeactivate(member.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove from workspace"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <span className={cn(
                        'px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide border',
                        ROLE_COLORS[member.role]
                      )}>
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inactive members */}
      {inactiveMembers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">
              Inactive Members ({inactiveMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {inactiveMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between px-6 py-3 opacity-50">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs">
                      {(member.full_name ?? member.email ?? '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm">{member.full_name ?? member.email}</p>
                      <p className="text-xs text-muted-foreground">Removed</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const res = await fetch('/api/team/members', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ member_id: member.id, is_active: true }),
                        })
                        if (res.ok) setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, is_active: true } : m))
                      }}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
