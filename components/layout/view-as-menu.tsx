'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, RotateCcw, Loader2, ChevronRight } from 'lucide-react'
import type { WorkspaceRole } from '@/types/database'

interface Member {
  user_id: string
  full_name: string | null
  email: string | null
  role: WorkspaceRole
  is_me: boolean
}

interface ViewAsMenuProps {
  /** The real caller's role — the section only renders for real admins. */
  realRole: WorkspaceRole | null
  isImpersonating: boolean
  impersonatedName: string | null
  /** Close the parent (user) dropdown after an action. */
  onClose?: () => void
}

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  super_admin: 'Admin',
  admin: 'Admin',
  rep: 'Rep',
}

/**
 * "View as teammate" (impersonation) rendered as a section INSIDE the header's
 * user/avatar dropdown. Real admins only. Expands inline to a member list;
 * while viewing-as it shows the active identity + a "Back to my account" item.
 */
export function ViewAsMenu({ realRole, isImpersonating, impersonatedName, onClose }: ViewAsMenuProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [members, setMembers] = useState<Member[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const isRealAdmin = realRole === 'admin' || realRole === 'super_admin'

  const loadMembers = useCallback(() => {
    if (members !== null || loading) return
    setLoading(true)
    fetch('/api/team/members')
      .then((r) => r.json())
      .then((j) => setMembers((j.members ?? []) as Member[]))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }, [members, loading])

  if (!isRealAdmin) return null

  async function viewAs(userId: string) {
    setBusy(true)
    try {
      await fetch('/api/impersonation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      onClose?.()
      router.push('/dashboard')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function exit() {
    setBusy(true)
    try {
      await fetch('/api/impersonation', { method: 'DELETE' })
      onClose?.()
      router.push('/dashboard')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="border-t border-border" />
      <div className="py-1" role="none">
        {isImpersonating ? (
          <>
            <div className="px-3.5 py-1.5 text-xs text-muted-foreground">
              Viewing as <span className="font-semibold text-foreground">{impersonatedName ?? 'teammate'}</span>
            </div>
            <button
              role="menuitem"
              type="button"
              onClick={exit}
              disabled={busy}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4 text-muted-foreground" /> Back to my account
            </button>
          </>
        ) : !expanded ? (
          <button
            role="menuitem"
            type="button"
            onClick={() => { setExpanded(true); loadMembers() }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-secondary"
          >
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-left">View as teammate</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        ) : (
          <>
            <div className="px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              View as teammate
            </div>
            <div className="max-h-60 overflow-auto">
              {loading ? (
                <div className="flex items-center gap-2 px-3.5 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading team…
                </div>
              ) : (members ?? []).filter((m) => !m.is_me).length === 0 ? (
                <div className="px-3.5 py-2 text-xs text-muted-foreground">No teammates found.</div>
              ) : (
                (members ?? [])
                  .filter((m) => !m.is_me)
                  .map((m) => {
                    const label = m.full_name ?? m.email?.split('@')[0] ?? 'Unknown'
                    return (
                      <button
                        key={m.user_id}
                        role="menuitem"
                        type="button"
                        disabled={busy}
                        onClick={() => viewAs(m.user_id)}
                        className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm text-foreground hover:bg-secondary disabled:opacity-50"
                      >
                        <span className="min-w-0 truncate">{label}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                      </button>
                    )
                  })
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
