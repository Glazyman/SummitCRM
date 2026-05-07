'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Send,
  BarChart2,
  Settings,
  Bell,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type { WorkspaceRole } from '@/types/database'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
  minRole?: WorkspaceRole
}

const mainNav: NavItem[] = [
  { label: 'Dashboard',       href: '/dashboard', icon: LayoutDashboard },
  { label: 'Leads',           href: '/leads',     icon: Users            },
  { label: 'Campaigns',       href: '/campaigns', icon: Send, minRole: 'manager' },
  { label: 'Admin Dashboard', href: '/admin',     icon: Shield, minRole: 'manager' },
  { label: 'Analytics',       href: '/analytics', icon: BarChart2        },
]

const bottomNav: NavItem[] = [
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  rep: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
}

function canAccess(userRole: WorkspaceRole | null, minRole?: WorkspaceRole): boolean {
  if (!minRole) return true
  if (!userRole) return false
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole]
}

interface SidebarProps {
  workspaceName?: string | null
  role?: WorkspaceRole | null
}

export function Sidebar({ workspaceName, role }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === href
    return pathname.startsWith(href)
  }

  const visibleMain = mainNav.filter((item) => canAccess(role ?? null, item.minRole))
  const isAdmin = role === 'admin' || role === 'super_admin'

  return (
    <aside
      className={cn(
        'group relative flex h-full flex-col border-r border-border bg-card transition-all duration-200',
        collapsed ? 'w-[60px]' : 'w-[var(--sidebar-width)]'
      )}
    >
      {/* Workspace header */}
      <div className={cn(
        'flex h-[var(--header-height)] shrink-0 items-center gap-3 border-b border-border px-4',
        collapsed && 'justify-center px-2'
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/25">
          <span className="text-sm font-bold text-primary-foreground">
            {(workspaceName?.trim()?.[0] ?? 'S').toUpperCase()}
          </span>
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold">
            {workspaceName ?? 'Summits CRM'}
          </span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 scrollbar-thin">
        <div className="flex flex-col gap-0.5">
          {visibleMain.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        {/* Settings section for admins */}
        {isAdmin && !collapsed && (
          <div className="mt-4">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace
            </p>
            <NavLink
              item={{ label: 'Team Members', href: '/settings/team', icon: Users }}
              active={isActive('/settings/team')}
              collapsed={collapsed}
            />
          </div>
        )}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5 border-t border-border p-2">
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-[72px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3" />
          : <ChevronLeft className="h-3 w-3" />
        }
      </button>
    </aside>
  )
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
}) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-2' : '',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.badge != null && item.badge > 0 && (
        <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  )
}
