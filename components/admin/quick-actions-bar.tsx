'use client'

/**
 * components/admin/quick-actions-bar.tsx
 *
 * Quick action shortcuts in the dashboard header.
 * Role-gated: admin gets all actions, manager gets subset.
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  UserPlus, Settings, Megaphone, AlertCircle, X, Mail, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface InviteModalProps {
  onClose: () => void
}

function InviteModal({ onClose }: InviteModalProps) {
  const [email, setEmail]     = useState('')
  const [role,  setRole]      = useState('rep')
  const [sent,  setSent]      = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    setLoading(true)
    // Placeholder — wire to /api/workspace/invite when built
    await new Promise((r) => setTimeout(r, 800))
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Invite team member</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!sent ? (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="rep">Sales Rep</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSend} disabled={!email || loading} className="flex-1 gap-2">
                {loading ? 'Sending…' : <><Mail className="h-4 w-4" /> Send invite</>}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </>
        ) : (
          <div className="py-4 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-medium">Invite sent to {email}</p>
            <p className="text-sm text-muted-foreground">
              They'll receive an email to join your workspace as a {role}.
            </p>
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        )}
      </div>
    </div>
  )
}

interface QuickActionsBarProps {
  isAdmin:   boolean
  quotaAlerts?: number
}

export function QuickActionsBar({ isAdmin, quotaAlerts = 0 }: QuickActionsBarProps) {
  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <>
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}

      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInviteOpen(true)}
            className="gap-2 h-9"
          >
            <UserPlus className="h-4 w-4" />
            Invite member
          </Button>
        )}

        {isAdmin && (
          <Button variant="outline" size="sm" asChild className="gap-2 h-9">
            <Link href="/settings/sending-accounts">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Sending accounts</span>
              {quotaAlerts > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                  {quotaAlerts}
                </span>
              )}
            </Link>
          </Button>
        )}

        <Button variant="outline" size="sm" asChild className="gap-2 h-9">
          <Link href="/campaigns">
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">All campaigns</span>
          </Link>
        </Button>

        {quotaAlerts > 0 && (
          <div className="flex items-center gap-1.5 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 px-3 py-1.5 text-sm text-orange-700 dark:text-orange-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {quotaAlerts} account{quotaAlerts > 1 ? 's' : ''} near quota limit
          </div>
        )}
      </div>
    </>
  )
}
