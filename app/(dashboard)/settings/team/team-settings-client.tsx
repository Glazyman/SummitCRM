'use client'

import * as React from 'react'
import { Users, UserPlus, Shield, Mail, Check, X, Clock, RefreshCw, Trash2, Phone } from 'lucide-react'
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
  is_protected_owner?: boolean
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

interface RepCallTargetRow {
  user_id:                string
  full_name:              string | null
  email:                  string | null
  override_daily_target:  number | null
  effective_daily_target: number
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  super_admin: 'Admin',
  admin:       'Admin',
  rep:         'Rep',
}

const ROLE_COLORS: Record<WorkspaceRole, string> = {
  super_admin: 'bg-primary/10 text-primary border-primary/20',
  admin:       'bg-primary/10 text-primary border-primary/20',
  rep:         'bg-muted text-muted-foreground border-border',
}

// ── Invite form ────────────────────────────────────────────────────────────
function InviteForm({ onInvite }: { onInvite: (email: string, role: WorkspaceRole) => Promise<string | null> }) {
  const [email, setEmail]     = React.useState('')
  const [role, setRole]       = React.useState<WorkspaceRole>('rep')
  const [submitting, setSub]  = React.useState(false)
  const [error, setError]     = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSuccess(null); setInviteUrl(null)
    if (!email.trim()) return
    setSub(true)
    try {
      const url = await onInvite(email.trim(), role)
      setSuccess(`Invitation sent to ${email.trim()}`)
      setInviteUrl(url)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setSub(false)
    }
  }

  const availableRoles: { value: WorkspaceRole; label: string; desc: string }[] = [
    { value: 'rep',   label: 'Rep',   desc: 'Can view leads, log calls, send emails' },
    { value: 'admin', label: 'Admin', desc: 'Full access — manage team, settings, and all leads' },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            {success}
          </div>
          {inviteUrl && (
            <div className="mt-1.5 text-xs">
              Invite link:{' '}
              <a href={inviteUrl} target="_blank" rel="noreferrer" className="underline break-all">
                {inviteUrl}
              </a>
            </div>
          )}
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
  const [targetLoading, setTargetLoading] = React.useState(true)
  const [targetSaving, setTargetSaving] = React.useState(false)
  const [targetError, setTargetError] = React.useState<string | null>(null)
  const [targetSuccess, setTargetSuccess] = React.useState<string | null>(null)
  const [workspaceDefaultTarget, setWorkspaceDefaultTarget] = React.useState(100)
  const [repTargetDrafts, setRepTargetDrafts] = React.useState<Record<string, string>>({})
  const [repTargetRows, setRepTargetRows] = React.useState<RepCallTargetRow[]>([])

  // Load members on mount
  React.useEffect(() => {
    fetch('/api/team/members')
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (!isAdmin) return
    fetch('/api/admin/call-targets')
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? 'Failed to load call targets')
        setWorkspaceDefaultTarget(json.workspace_default_daily_target ?? 100)
        setRepTargetRows(json.reps ?? [])
        const nextDrafts: Record<string, string> = {}
        for (const rep of (json.reps ?? []) as RepCallTargetRow[]) {
          nextDrafts[rep.user_id] = rep.override_daily_target ? String(rep.override_daily_target) : ''
        }
        setRepTargetDrafts(nextDrafts)
      })
      .catch((err) => setTargetError(err instanceof Error ? err.message : 'Failed to load call targets'))
      .finally(() => setTargetLoading(false))
  }, [isAdmin])

  async function saveCallTargets() {
    setTargetError(null)
    setTargetSuccess(null)

    const parsedDefault = Number.parseInt(String(workspaceDefaultTarget), 10)
    if (!Number.isInteger(parsedDefault) || parsedDefault < 1) {
      setTargetError('Default daily target must be a whole number greater than 0.')
      return
    }

    const overrides: Array<{ user_id: string; daily_target: number | null }> = []
    for (const row of repTargetRows) {
      const raw = (repTargetDrafts[row.user_id] ?? '').trim()
      if (!raw) {
        overrides.push({ user_id: row.user_id, daily_target: null })
        continue
      }
      const parsed = Number.parseInt(raw, 10)
      if (!Number.isInteger(parsed) || parsed < 1) {
        setTargetError('Rep override targets must be whole numbers greater than 0, or empty.')
        return
      }
      overrides.push({ user_id: row.user_id, daily_target: parsed })
    }

    setTargetSaving(true)
    try {
      const res = await fetch('/api/admin/call-targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_default_daily_target: parsedDefault,
          overrides,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save call targets')
      setTargetSuccess('Daily call targets saved.')

      const refreshed = await fetch('/api/admin/call-targets')
      const refreshedJson = await refreshed.json()
      if (refreshed.ok) {
        setWorkspaceDefaultTarget(refreshedJson.workspace_default_daily_target ?? parsedDefault)
        setRepTargetRows(refreshedJson.reps ?? [])
        const nextDrafts: Record<string, string> = {}
        for (const rep of (refreshedJson.reps ?? []) as RepCallTargetRow[]) {
          nextDrafts[rep.user_id] = rep.override_daily_target ? String(rep.override_daily_target) : ''
        }
        setRepTargetDrafts(nextDrafts)
      }
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : 'Failed to save call targets')
    } finally {
      setTargetSaving(false)
    }
  }

  async function handleInvite(email: string, role: WorkspaceRole): Promise<string | null> {
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
    return data.invitation?.invite_url ?? null
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

  async function handleDeleteMember(memberId: string, name: string) {
    if (!confirm(`Remove ${name} from the workspace? This cannot be undone.`)) return
    const res = await fetch('/api/team/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId }),
    })
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    }
  }

  async function handleDeleteInvite(inviteId: string, email: string) {
    if (!confirm(`Cancel invitation for ${email}?`)) return
    const res = await fetch('/api/team/invite', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitation_id: inviteId }),
    })
    if (res.ok) {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))
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
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide border',
                      ROLE_COLORS[invite.role as WorkspaceRole] ?? 'bg-muted text-muted-foreground border-border'
                    )}>
                      {ROLE_LABELS[invite.role as WorkspaceRole] ?? invite.role}
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteInvite(invite.id, invite.email)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Cancel invitation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily call targets */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="w-4 h-4" /> Daily Call Targets
            </CardTitle>
            <CardDescription>
              Set a workspace default (100 recommended) and optional per-rep overrides.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {targetError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {targetError}
              </div>
            )}
            {targetSuccess && (
              <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                {targetSuccess}
              </div>
            )}

            <div className="grid gap-2 max-w-xs">
              <Label htmlFor="workspace-default-target">Workspace default daily target</Label>
              <Input
                id="workspace-default-target"
                type="number"
                min={1}
                step={1}
                value={workspaceDefaultTarget}
                onChange={(e) => setWorkspaceDefaultTarget(Number.parseInt(e.target.value || '0', 10))}
              />
            </div>

            {targetLoading ? (
              <div className="text-sm text-muted-foreground">Loading rep targets…</div>
            ) : repTargetRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No reps found yet.</div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_130px_130px] gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border bg-muted/40">
                  <span>Rep</span>
                  <span>Override</span>
                  <span>Effective</span>
                </div>
                <div className="divide-y divide-border">
                  {repTargetRows.map((rep) => (
                    <div key={rep.user_id} className="grid grid-cols-[1fr_130px_130px] gap-2 px-3 py-2 items-center">
                      {(() => {
                        const draft = (repTargetDrafts[rep.user_id] ?? '').trim()
                        const draftNum = Number.parseInt(draft, 10)
                        const effective = Number.isInteger(draftNum) && draftNum > 0 ? draftNum : workspaceDefaultTarget
                        return (
                          <>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{rep.full_name ?? rep.email ?? rep.user_id}</p>
                        {rep.full_name && rep.email && (
                          <p className="text-xs text-muted-foreground truncate">{rep.email}</p>
                        )}
                      </div>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        placeholder="Default"
                        value={repTargetDrafts[rep.user_id] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setRepTargetDrafts((prev) => ({ ...prev, [rep.user_id]: v }))
                        }}
                      />
                      <p className="text-sm">{effective}</p>
                          </>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={saveCallTargets} disabled={targetSaving || targetLoading}>
                {targetSaving ? 'Saving…' : 'Save Call Targets'}
              </Button>
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
                    {isAdmin && !member.is_me && !member.is_protected_owner ? (
                      <>
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as WorkspaceRole)}
                          className="h-7 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {(['rep', 'admin'] as WorkspaceRole[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleDeleteMember(member.id, member.full_name ?? member.email ?? 'this member')}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide border',
                          ROLE_COLORS[member.role]
                        )}>
                          {ROLE_LABELS[member.role]}
                        </span>
                        {member.is_protected_owner && (
                          <span className="text-[10px] text-muted-foreground">Protected</span>
                        )}
                      </div>
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
                    <div className="flex items-center gap-2">
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
                      <button
                        onClick={() => handleDeleteMember(member.id, member.full_name ?? member.email ?? 'this member')}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
