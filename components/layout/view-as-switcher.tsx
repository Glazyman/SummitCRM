'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, ChevronDown, Check, RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import type { WorkspaceRole } from '@/types/database'

interface Member {
  user_id: string
  full_name: string | null
  email: string | null
  role: WorkspaceRole
  is_me: boolean
}

interface ViewAsSwitcherProps {
  /** The real caller's role — the switcher only renders for real admins. */
  realRole: WorkspaceRole | null
  isImpersonating: boolean
  impersonatedName: string | null
}

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  super_admin: 'Admin',
  admin: 'Admin',
  rep: 'Rep',
}

/**
 * Admin-only header control to "view as" another teammate (impersonation).
 * Real admins can jump into any teammate's view; while viewing-as it shows the
 * active identity and an exit action. Keyed on the REAL role so an impersonated
 * (rep-level) session can never see or use it.
 */
export function ViewAsSwitcher({ realRole, isImpersonating, impersonatedName }: ViewAsSwitcherProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<Member[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const isRealAdmin = realRole === 'admin' || realRole === 'super_admin'

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Lazy-load the member list the first time the menu opens (fired from the
  // open handler, not an effect, to avoid a synchronous setState-in-effect).
  const loadMembers = useCallback(() => {
    if (members !== null || loading) return
    setLoading(true)
    fetch('/api/team/members')
      .then((r) => r.json())
      .then((j) => setMembers((j.members ?? []) as Member[]))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }, [members, loading])

  function toggle() {
    setOpen((o) => {
      if (!o) loadMembers()
      return !o
    })
  }

  if (!isRealAdmin) return null

  async function viewAs(userId: string) {
    setBusy(true)
    try {
      await fetch('/api/impersonation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      setOpen(false)
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
      setOpen(false)
      router.push('/dashboard')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-30" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'flex h-11 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors',
          isImpersonating
            ? 'border-amber-400/60 bg-amber-100 text-amber-900 hover:bg-amber-200/80 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200'
            : 'border-border bg-card text-foreground hover:bg-secondary',
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        title={isImpersonating ? `Viewing as ${impersonatedName ?? 'teammate'}` : 'View as a teammate'}
      >
        <Eye className="h-4 w-4 shrink-0" />
        <span className="hidden max-w-[140px] truncate sm:block">
          {isImpersonating ? `Viewing as ${impersonatedName ?? 'teammate'}` : 'View as'}
        </span>
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'fixed inset-x-3 top-[68px] z-50 w-auto overflow-hidden rounded-2xl border border-border bg-popover shadow-card',
            'sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72',
          )}
        >
          <div className="px-3.5 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">View as teammate</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              See the app exactly as they do. Actions you take are recorded under them.
            </p>
          </div>

          {isImpersonating && (
            <>
              <div className="border-t border-border" />
              <button
                role="menuitem"
                type="button"
                onClick={exit}
                disabled={busy}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                Back to my account
              </button>
            </>
          )}

          <div className="border-t border-border" />
          <div className="max-h-72 overflow-auto py-1">
            {loading ? (
              <div className="flex items-center gap-2 px-3.5 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading team…
              </div>
            ) : (members ?? []).length === 0 ? (
              <div className="px-3.5 py-3 text-xs text-muted-foreground">No teammates found.</div>
            ) : (
              (members ?? []).map((m) => {
                const label = m.full_name ?? m.email?.split('@')[0] ?? 'Unknown'
                const active = isImpersonating && impersonatedName != null && label === impersonatedName
                return (
                  <button
                    key={m.user_id}
                    role="menuitem"
                    type="button"
                    disabled={busy || m.is_me}
                    onClick={() => (m.is_me ? exit() : viewAs(m.user_id))}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-secondary disabled:cursor-default disabled:opacity-60"
                  >
                    <Avatar name={label} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {label} {m.is_me && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ROLE_LABEL[m.role]}{m.email ? ` · ${m.email}` : ''}
                      </p>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0 text-foreground" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
