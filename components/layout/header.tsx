'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Moon, Sun, LogOut, User, Menu, Settings, ChevronDown, Shield, Search } from 'lucide-react'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/notifications/notification-bell'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { WorkspaceRole } from '@/types/database'

// ── Page title from pathname ───────────────────────────────────────────────
const ROUTE_TITLES: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/leads':         'Leads',
  '/campaigns':     'Campaigns',
  '/analytics':     'Analytics',
  '/notifications': 'Notifications',
  '/settings':      'Settings',
  '/admin':         'Admin',
}

function getPageTitle(pathname: string): string {
  for (const [route, title] of Object.entries(ROUTE_TITLES)) {
    if (pathname === route || (route !== '/dashboard' && pathname.startsWith(route))) {
      return title
    }
  }
  return 'Summit CRM'
}

// ── Role badge ────────────────────────────────────────────────────────────
const ROLE_STYLES: Record<WorkspaceRole, string> = {
  super_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  admin:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  manager:     'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  rep:         'bg-secondary text-secondary-foreground',
  viewer:      'bg-muted text-muted-foreground',
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  manager:     'Manager',
  rep:         'Rep',
  viewer:      'Viewer',
}

function RoleBadge({ role }: { role: WorkspaceRole }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
      ROLE_STYLES[role]
    )}>
      {ROLE_LABELS[role]}
    </span>
  )
}

// ── Header ────────────────────────────────────────────────────────────────
interface HeaderProps {
  user: SupabaseUser | null
  role?: WorkspaceRole | null
  workspaceName?: string | null
  onMenuClick?: () => void
}

export function Header({ user, role, workspaceName, onMenuClick }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const supabase = createClient()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  useEffect(() => {
    setDropdownOpen(false)
  }, [router])

  async function handleSignOut() {
    setDropdownOpen(false)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function navigate(path: string) {
    setDropdownOpen(false)
    router.push(path)
  }

  const fullName = user?.user_metadata?.full_name as string | undefined
  const email = user?.email ?? ''
  const displayName = fullName ?? email
  const pageTitle = getPageTitle(pathname)

  return (
    <header
      className="flex h-[var(--header-height)] shrink-0 items-center gap-3 border-b border-border px-7"
      style={{
        background: 'color-mix(in oklab, hsl(var(--background)) 80%, transparent)',
        backdropFilter: 'saturate(180%) blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onMenuClick}
        className="mr-1 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <h1 className="text-[22px] font-bold tracking-[-0.025em] leading-none">
        {pageTitle}
      </h1>

      {/* Search — pill shaped */}
      <div className="ml-auto flex w-72 items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-muted-foreground">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input
          className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground"
          placeholder="Search leads, campaigns…"
          readOnly
        />
        <kbd className="hidden rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:block">
          ⌘K
        </kbd>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </button>

        {/* Notifications */}
        <div className="flex h-9 w-9 items-center justify-center">
          <NotificationBell />
        </div>

        {/* User dropdown */}
        <div className="relative ml-1" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={cn(
              'flex items-center gap-2 rounded-full px-2 py-1.5 text-sm transition-colors',
              'hover:bg-secondary',
              dropdownOpen && 'bg-secondary'
            )}
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
          >
            <Avatar name={displayName} size="sm" />
            <span className="hidden max-w-[100px] truncate text-[13.5px] font-semibold md:block">
              {fullName ?? email.split('@')[0]}
            </span>
            <ChevronDown className={cn(
              'hidden h-3 w-3 text-muted-foreground transition-transform duration-150 md:block',
              dropdownOpen && 'rotate-180'
            )} />
          </button>

          {/* Dropdown panel */}
          {dropdownOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-popover shadow-lg shadow-black/10 dark:shadow-black/30"
            >
              {/* User info */}
              <div className="px-3.5 py-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={displayName} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{fullName ?? 'User'}</p>
                    <p className="truncate text-xs text-muted-foreground">{email}</p>
                  </div>
                </div>
                {role && (
                  <div className="mt-2.5">
                    <RoleBadge role={role} />
                  </div>
                )}
                {workspaceName && (
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">
                    {workspaceName}
                  </p>
                )}
              </div>

              <div className="border-t border-border" />

              <div className="py-1" role="none">
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-accent"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Settings
                </button>

                <button
                  role="menuitem"
                  type="button"
                  onClick={() => navigate('/settings/profile')}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-accent"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile
                </button>

                {role && ['admin', 'super_admin'].includes(role) && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => navigate('/admin')}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Admin Panel
                  </button>
                )}
              </div>

              <div className="border-t border-border" />

              <div className="py-1" role="none">
                <button
                  role="menuitem"
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
