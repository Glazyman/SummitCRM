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
  Shield,
  Star,
  Building2,
  MoreHorizontal,
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
  { label: 'Dashboard',       href: '/dashboard', icon: LayoutDashboard },
  { label: 'Leads',           href: '/leads',     icon: Users            },
  { label: 'Campaigns',       href: '/campaigns', icon: Send, minRole: 'manager' },
  { label: 'Admin Dashboard', href: '/admin',     icon: Shield, minRole: 'manager' },
  { label: 'Analytics',       href: '/analytics', icon: BarChart2        },
]

const bottomNav: NavItem[] = [
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Settings',      href: '/settings',      icon: Settings },
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

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === href
    return pathname.startsWith(href)
  }

  const visibleMain = mainNav.filter((item) => canAccess(role ?? null, item.minRole))
  const isAdmin = role === 'admin' || role === 'super_admin'
  const initials = getInitials(userName, userEmail)
  const displayName = userName ?? userEmail?.split('@')[0] ?? 'You'

  return (
    <aside className="flex h-full w-[var(--sidebar-width)] flex-col border-r border-border bg-background">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-sm font-bold tracking-tight text-white"
          style={{
            background: 'linear-gradient(135deg, hsl(218 100% 52%), color-mix(in oklch, hsl(218 100% 52%) 60%, #fff))',
            boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.1)',
          }}
        >
          {(workspaceName?.trim()?.[0] ?? 'S').toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold leading-tight tracking-[-0.02em]">
            Summit
          </div>
          <div className="truncate text-[11px] text-muted-foreground leading-tight mt-0.5">
            {workspaceName ?? 'Workspace'}
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-3.5 scrollbar-thin">
        <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Workspace
        </p>
        <div className="flex flex-col gap-0.5">
          {visibleMain.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>

        {/* Settings section for admins */}
        {isAdmin && (
          <div className="mt-5">
            <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Workspace settings
            </p>
            <NavLink
              item={{ label: 'Team Members', href: '/settings/team', icon: Users }}
              active={isActive('/settings/team')}
            />
          </div>
        )}

        {/* Lists section */}
        <div className="mt-5">
          <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Lists
          </p>
          <div className="flex flex-col gap-0.5">
            <NavLink item={{ label: 'Starred',   href: '/leads?filter=starred',   icon: Star      }} active={false} />
            <NavLink item={{ label: 'Companies', href: '/leads?filter=companies', icon: Building2 }} active={false} />
          </div>
        </div>
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5 px-3.5 pt-2 pb-2">
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>

      {/* Footer — user info */}
      <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
        {/* Avatar */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #7E5BEF, #14B5B5)' }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold leading-tight">{displayName}</p>
          {userEmail && (
            <p className="truncate text-[11.5px] text-muted-foreground leading-tight mt-0.5">
              {userEmail}
            </p>
          )}
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
        'flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-[14.5px] font-medium transition-all duration-100',
        active
          ? 'bg-card text-foreground shadow-card'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0',
          active ? 'text-primary' : 'text-muted-foreground'
        )}
      />
      <span className="flex-1">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none',
            active
              ? 'bg-primary/10 text-primary'
              : 'bg-secondary text-muted-foreground'
          )}
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  )
}
