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
  Kanban,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
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
  const [collapsed, setCollapsed]         = React.useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true' } catch { return false }
  })

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('sidebar_collapsed', String(next)) } catch {}
  }

  React.useEffect(() => {
    fetch('/api/activities/due')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setActivitiesDue(d.count ?? 0))
      .catch(() => {})
  }, [pathname]) // refresh count on every navigation

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
    <aside className={cn(
      'flex h-full flex-col border-r border-border bg-background transition-all duration-200',
      collapsed ? 'w-[60px]' : 'w-[var(--sidebar-width)]'
    )}>
      {/* Brand */}
      {collapsed ? (
        /* Collapsed: show only the expand button, centered and obvious */
        <div className="flex flex-col items-center gap-3 px-2 pb-3 pt-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground shadow-card">
            {(workspaceName?.trim()?.[0] ?? 'S').toUpperCase()}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-primary-glow hover:bg-primary/90 transition-colors"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
        /* Expanded: workspace name + collapse button */
        <div className="flex items-center gap-2.5 px-3 pb-3 pt-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground shadow-card">
            {(workspaceName?.trim()?.[0] ?? 'S').toUpperCase()}
          </div>
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-none tracking-[-0.02em]">
            {workspaceName ?? 'Summit Mergers'}
          </p>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main nav */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-2 scrollbar-thin">
        {!collapsed && (
          <Link
            href="/leads/import"
            className="mb-3 flex items-center gap-2 rounded-lg bg-primary px-2.5 py-2 text-[13px] font-medium text-primary-foreground shadow-primary-glow transition-colors hover:bg-primary/90"
          >
            <PlusCircle className="h-4 w-4" />
            Quick Create
          </Link>
        )}
        {collapsed && (
          <Link
            href="/leads/import"
            className="mb-3 flex items-center justify-center rounded-lg bg-primary p-2 text-primary-foreground shadow-primary-glow transition-colors hover:bg-primary/90"
            title="Quick Create"
          >
            <PlusCircle className="h-4 w-4" />
          </Link>
        )}

        <div className="flex flex-col gap-1">
          {visibleMain.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        {/* Settings section for admins */}
        {isAdmin && !collapsed && (
          <div className="mt-6">
            <p className="mb-2 px-2 text-[11px] font-medium text-muted-foreground">Admin</p>
            <NavLink item={{ label: 'Team Members', href: '/settings/team', icon: Users }} active={isActive('/settings/team')} />
          </div>
        )}
        {isAdmin && collapsed && (
          <div className="mt-4">
            <NavLink item={{ label: 'Team Members', href: '/settings/team', icon: Users }} active={isActive('/settings/team')} collapsed />
          </div>
        )}

        {/* Documents section — admins only, hidden when collapsed */}
        {!isRep && !collapsed && (
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
      <div className="flex flex-col gap-1 px-2 pb-3 pt-2">
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </div>

      {/* Footer — user info */}
      <div className={cn(
        'flex items-center border-t border-border px-2 py-3',
        collapsed ? 'justify-center' : 'gap-2.5'
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[11px] font-semibold text-foreground">
          {initials}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight">{displayName}</p>
              {userEmail && (
                <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{userEmail}</p>
              )}
            </div>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item:      NavItem
  active:    boolean
  collapsed?: boolean
}) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center rounded-lg py-2 text-[13px] font-medium transition-colors duration-100',
        collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5',
        active
          ? 'bg-primary text-primary-foreground shadow-primary-glow'
          : 'text-foreground/75 hover:bg-secondary hover:text-foreground'
      )}
    >
      <span className="relative shrink-0">
        <Icon className={cn('h-4 w-4', active ? 'text-primary-foreground' : 'text-muted-foreground')} />
        {collapsed && item.badge != null && item.badge > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {!collapsed && item.badge != null && item.badge > 0 && (
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
