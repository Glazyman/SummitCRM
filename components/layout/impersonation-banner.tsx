'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, X } from 'lucide-react'
import type { WorkspaceRole } from '@/types/database'

interface ImpersonationBannerProps {
  name: string | null
  role: WorkspaceRole
}

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  super_admin: 'Admin',
  admin: 'Admin',
  rep: 'Rep',
}

/**
 * Persistent strip shown across every dashboard page while an admin is viewing
 * as another teammate, so they can never forget the current session is being
 * recorded under that person. One-click exit returns to their own account.
 */
export function ImpersonationBanner({ name, role }: ImpersonationBannerProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function exit() {
    setBusy(true)
    try {
      await fetch('/api/impersonation', { method: 'DELETE' })
      router.push('/dashboard')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-center text-[13px] font-semibold text-amber-950">
      <Eye className="h-4 w-4 shrink-0" />
      <span className="truncate">
        You&apos;re acting as <span className="font-bold">{name ?? 'a teammate'}</span> ({ROLE_LABEL[role]}). Everything you do is recorded under them.
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-950/15 px-2.5 py-0.5 text-xs font-bold text-amber-950 transition-colors hover:bg-amber-950/25 disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        Exit
      </button>
    </div>
  )
}
