'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  BarChart2,
  Settings,
  Bell,
  Shield,
  PlusCircle,
  Building2,
  MoreHorizontal,
  Inbox,
  Kanban,
  ListChecks,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceRole } from '@/types/database'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
  minRole?: WorkspaceRole
}

const mainNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Leads',     href: '/leads',     icon: Users },
  { label: 'Pipeline',   href: '/pipeline',   icon: Kanban },
  { label: 'Activities', href: '/activities', icon: ListChecks },
  { label: 'Analytics', href: '/analytics', icon: BarChart2, minRole: 'admin' },
  { label: 'Admin',     href: '/admin',     icon: Shield,    minRole: 'admin' },
]

const bottomNav: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
]

const ROLE_RANK: Record<WorkspaceRole, number> = {
  rep:         1,
  admin:       2,
  super_admin: 3,
}

function canAccess(userRole: WorkspaceRole | null, minRole?: WorkspaceRole): boolean {
  if (!minRole) return true
  if (!userRole) return false
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole]
}

interface SidebarProps {
  workspaceName?: string | null
  role?: WorkspaceRole | null
  userEmail?: string | null
  userName?: string | null
}

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return 'U'
}

export function Sidebar({ workspaceName, role, userEmail, userName }: SidebarProps) {
  const pathname = usePathname()
  const [activitiesDue, setActivitiesDue] = React.useState<number | undefined>(undefined)

  React.useEffect(() => {
    if (role !== 'rep') return
    fetch('/api/activities/due')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setActivitiesDue(d.count ?? 0))
      .catch(() => {})
  }, [role, pathname]) // refresh count on navigation

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === href
    return pathname.startsWith(href)
  }

  const visibleMain = mainNav.map((item) => {
    if (item.href === '/activities' && activitiesDue && activitiesDue > 0) {
      return { ...item, badge: activitiesDue }
    }
    return item
  }).filter((item) => canAccess(role ?? null, item.minRole))

  const isAdmin = role === 'admin' || role === 'super_admin'
  const isRep   = role === 'rep'
  const initials = getInitials(userName, userEmail)
  const displayName = userName ?? userEmail?.split('@')[0] ?? 'You'

  return (
    <aside className="flex h-full w-[var(--sidebar-width)] flex-col border-r border-border bg-background">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground shadow-card">
          {(workspaceName?.trim()?.[0] ?? 'S').toUpperCase()}
        </div>
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-none tracking-[-0.02em]">
          {workspaceName ?? 'Summit Mergers'}
        </p>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Inbox"
        >
          <Inbox className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-3 scrollbar-thin">
        <Link
          href="/leads/import"
          className="mb-3 flex items-center gap-2 rounded-lg bg-primary px-2.5 py-2 text-[13px] font-medium text-primary-foreground shadow-primary-glow transition-colors hover:bg-primary/90"
        >
          <PlusCircle className="h-4 w-4" />
          Quick Create
        </Link>

        <div className="flex flex-col gap-1">
          {visibleMain.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>

        {/* Settings section for admins */}
        {isAdmin && (
          <div className="mt-6">
            <p className="mb-2 px-2 text-[11px] font-medium text-muted-foreground">
              Admin
            </p>
            <NavLink
              item={{ label: 'Team Members', href: '/settings/team', icon: Users }}
              active={isActive('/settings/team')}
            />
          </div>
        )}

        {/* Documents section — admins only */}
        {!isRep && (
          <div className="mt-6">
            <p className="mb-2 px-2 text-[11px] font-medium text-muted-foreground">
              Documents
            </p>
            <div className="flex flex-col gap-1">
              <NavLink item={{ label: 'Data Library', href: '/leads', icon: Building2 }} active={false} />
              <NavLink item={{ label: 'Reports', href: '/analytics', icon: BarChart2 }} active={false} />
              <NavLink item={{ label: 'Notifications', href: '/notifications', icon: Bell }} active={isActive('/notifications')} />
            </div>
          </div>
        )}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col gap-1 px-3 pb-3 pt-2">
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>

      {/* Footer — user info */}
      <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[11px] font-semibold text-foreground">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight">{displayName}</p>
          {userEmail && (
            <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
              {userEmail}
            </p>
          )}
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}

function NavLink({
  item,
  active,
}: {
  item: NavItem
  active: boolean
}) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors duration-100',
        active
          ? 'bg-primary text-primary-foreground shadow-primary-glow'
          : 'text-foreground/75 hover:bg-secondary hover:text-foreground'
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          active ? 'text-primary-foreground' : 'text-muted-foreground'
        )}
      />
      <span className="flex-1">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none',
            active
              ? 'bg-primary-foreground/15 text-primary-foreground'
              : 'bg-secondary text-muted-foreground'
          )}
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  )
}
