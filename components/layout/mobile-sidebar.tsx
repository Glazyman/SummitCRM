'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { Sidebar } from './sidebar'
import { cn } from '@/lib/utils'
import type { WorkspaceRole } from '@/types/database'

interface MobileSidebarProps {
  workspaceName?: string | null
  role?: WorkspaceRole | null
  userEmail?: string | null
  userName?: string | null
}

export function MobileSidebar({ workspaceName, role, userEmail, userName }: MobileSidebarProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden',
          'animate-in fade-in duration-200'
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full flex-col bg-card shadow-xl lg:hidden',
          'animate-in slide-in-from-left duration-200',
          'w-[var(--sidebar-width)]'
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>

        <Sidebar workspaceName={workspaceName} role={role} userEmail={userEmail} userName={userName} />
      </div>
    </>
  )
}
