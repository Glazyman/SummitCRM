'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Mail, Plus, MoreHorizontal, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, Pencil, Trash2, Activity,
  Server, Key, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { QuotaStatusBadge } from '@/components/email/quota-status-badge'
import { AddSendingAccountModal } from '@/components/email/add-sending-account-modal'
import type { SendingAccountPublic, QuotaStatus } from '@/lib/email/types'

// ── Status display config ──────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; badge: string; Icon: React.ComponentType<{ className?: string }> }> = {
  active:         { label: 'Active',         badge: 'bg-secondary text-foreground',   Icon: CheckCircle2 },
  paused:         { label: 'Paused',         badge: 'bg-gray-100 text-gray-600',          Icon: XCircle },
  error:          { label: 'Error',          badge: 'bg-secondary text-foreground',           Icon: XCircle },
  quota_exceeded: { label: 'Quota exceeded', badge: 'bg-secondary text-foreground',   Icon: AlertTriangle },
}

export default function SendingAccountsPage() {
  const [accounts,  setAccounts]  = React.useState<SendingAccountPublic[]>([])
  const [loading,   setLoading]   = React.useState(true)
  const [error,     setError]     = React.useState<string | null>(null)
  const [modalOpen, setModalOpen] = React.useState(false)
  const [deleting,  setDeleting]  = React.useState<string | null>(null)
  const [testing,   setTesting]   = React.useState<string | null>(null)
  const [testResults, setTestResults] = React.useState<Record<string, { success: boolean; message: string }>>({})

  // ── Fetch ─────────────────────────────────────────────────────────────
  async function loadAccounts() {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/sending-accounts')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setAccounts(data.accounts ?? [])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { loadAccounts() }, [])

  // ── Toggle active/inactive ─────────────────────────────────────────────
  async function handleToggleActive(id: string, isActive: boolean) {
    await fetch(`/api/sending-accounts/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active: !isActive }),
    })
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, is_active: !isActive } : a))
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('Deactivate this sending account? Existing email history is preserved.')) return
    setDeleting(id)
    await fetch(`/api/sending-accounts/${id}`, { method: 'DELETE' })
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    setDeleting(null)
  }

  // ── Test ──────────────────────────────────────────────────────────────
  async function handleTest(id: string) {
    setTesting(id)
    try {
      const res  = await fetch(`/api/sending-accounts/${id}/test`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      })
      const data = await res.json()
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: res.ok, message: res.ok ? 'Test email sent!' : (data.error ?? 'Test failed') }
      }))
      await loadAccounts()
    } finally {
      setTesting(null)
    }
  }

  // ── Derive account status ─────────────────────────────────────────────
  function getStatus(a: SendingAccountPublic): string {
    if (!a.is_active) return 'paused'
    if (a.last_error) return 'error'
    if (a.quota_remaining === 0) return 'quota_exceeded'
    return 'active'
  }

  // ── Build mock quotas map for display ─────────────────────────────────
  const quotas: Record<string, QuotaStatus> = React.useMemo(() =>
    Object.fromEntries(accounts.map((a) => [
      a.id,
      {
        account_id:   a.id,
        account_name: a.name,
        daily_limit:  a.daily_limit,
        sent_today:   a.emails_sent_today,
        remaining:    a.quota_remaining,
        percent_used: a.quota_percent,
        at_limit:     a.quota_remaining === 0,
        reset_at:     a.quota_reset_at,
      }
    ])),
    [accounts]
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/settings" className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>

      {/* ── Page header ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sending Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage email accounts used for outreach. Each account has a 50 emails/day limit.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* ── Info banner ── */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground">
        <Activity className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong>Email compliance:</strong> All emails include an unsubscribe link and respect suppression lists.
          Quotas reset daily at midnight UTC. Credentials are encrypted using AES-256-GCM.
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
          <button onClick={loadAccounts} className="ml-2 underline hover:no-underline">Retry</button>
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState onAdd={() => setModalOpen(true)} />
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => {
            const status = getStatus(account)
            const meta   = STATUS_META[status]
            const StatusIcon = meta.Icon
            const quota  = quotas[account.id]
            const testRes = testResults[account.id]

            return (
              <div
                key={account.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                {/* ── Card header ── */}
                <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Type icon */}
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      account.type === 'resend'
                        ? 'bg-secondary text-foreground'
                        : 'bg-secondary text-foreground'
                    )}>
                      {account.type === 'resend'
                        ? <Key className="h-5 w-5" />
                        : <Server className="h-5 w-5" />
                      }
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{account.name}</p>
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          meta.badge
                        )}>
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {account.type.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground truncate">
                        {account.from_name} &lt;{account.from_email}&gt;
                      </p>
                      {account.smtp_host && (
                        <p className="text-xs text-muted-foreground">{account.smtp_host}:{account.smtp_port}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => handleTest(account.id)}
                      disabled={testing === account.id || !account.is_active}
                    >
                      {testing === account.id
                        ? <Spinner className="h-3 w-3" />
                        : <Mail className="h-3.5 w-3.5" />
                      }
                      Test
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" minWidth="170px">
                        <DropdownMenuItem
                          onClick={() => handleToggleActive(account.id, account.is_active)}
                          icon={<RefreshCw className="h-3.5 w-3.5" />}
                        >
                          {account.is_active ? 'Pause account' : 'Activate account'}
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<Pencil className="h-3.5 w-3.5" />}>
                          Edit account
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          destructive
                          onClick={() => handleDelete(account.id)}
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                        >
                          {deleting === account.id ? 'Removing…' : 'Remove account'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* ── Quota bar ── */}
                <div className="border-t border-border px-5 py-3">
                  <QuotaStatusBadge quota={quota} size="sm" showBar />
                </div>

                {/* ── Error / test result ── */}
                {account.last_error && (
                  <div className="flex items-start gap-2 border-t border-border bg-secondary px-5 py-2.5 text-xs text-foreground">
                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{account.last_error}</span>
                  </div>
                )}
                {testRes && (
                  <div className={cn(
                    'flex items-start gap-2 border-t px-5 py-2.5 text-xs',
                    testRes.success
                      ? 'border-border bg-secondary text-foreground'
                      : 'border-border bg-secondary text-foreground'
                  )}>
                    {testRes.success
                      ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    }
                    {testRes.message}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal ── */}
      <AddSendingAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); loadAccounts() }}
      />
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Mail className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold">No sending accounts yet</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
          Add a Resend API key or SMTP server to start sending personalised emails to your leads.
        </p>
      </div>
      <Button onClick={onAdd} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add your first account
      </Button>
    </div>
  )
}
