'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Settings,
  PlusCircle,
  MoreHorizontal,
  Kanban,
  ListChecks,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserCog,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
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
  { label: 'Pipeline',  href: '/pipeline',  icon: Kanban },
  { label: 'Tasks',    href: '/tasks',     icon: ListChecks },
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
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const [activitiesDue, setActivitiesDue] = React.useState<number | undefined>(undefined)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }
  const [collapsed, setCollapsed]         = React.useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true' } catch { return false }
  })

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('sidebar_collapsed', String(next)) } catch {}
  }

  React.useEffect(() => {
    fetch('/api/tasks/due')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setActivitiesDue(d.count ?? 0))
      .catch(() => {})
  }, [pathname]) // refresh count on every navigation

  // When viewing a lead's full profile opened from another section (e.g.
  // /leads/<id>?from=/pipeline), keep THAT section highlighted instead of Leads.
  const fromParam = searchParams.get('from')
  const isLeadDetail = /^\/leads\/[^/]+$/.test(pathname) && pathname !== '/leads/import'
  const navPath = isLeadDetail && fromParam ? fromParam : pathname

  function isActive(href: string) {
    if (href === '/dashboard' || href === '/settings' || href === '/leads/import') return navPath === href
    if (href === '/leads') return navPath === '/leads' || (navPath.startsWith('/leads/') && !navPath.startsWith('/leads/import'))
    return navPath.startsWith(href)
  }

  const visibleMain = mainNav.map((item) => {
    if (item.href === '/tasks' && activitiesDue && activitiesDue > 0) {
      return { ...item, badge: activitiesDue }
    }
    return item
  }).filter((item) => canAccess(role ?? null, item.minRole))

  const isAdmin = role === 'admin' || role === 'super_admin'
  const initials = getInitials(userName, userEmail)
  const displayName = userName ?? userEmail?.split('@')[0] ?? 'You'

  return (
    <aside className={cn(
      'flex h-full flex-col bg-background transition-all duration-200',
      'relative border-r border-border',
      collapsed ? 'w-[64px]' : 'w-[var(--sidebar-width)]'
    )}>
      <button
        type="button"
        onClick={toggleCollapsed}
        className={cn(
          'absolute -right-3 top-[68px] z-30',
          'flex h-6 w-6 items-center justify-center',
          'text-muted-foreground transition-colors hover:text-foreground'
        )}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Brand */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 px-2 pb-4 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-foreground text-[13px] font-bold text-background">
            {(workspaceName?.trim()?.[0] ?? 'S').toUpperCase()}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-foreground text-[13px] font-bold text-background">
            {(workspaceName?.trim()?.[0] ?? 'S').toUpperCase()}
          </div>
          <p className="min-w-0 flex-1 truncate text-[15px] font-bold leading-none tracking-[-0.02em]">
            {workspaceName ?? 'Summit Mergers'}
          </p>
        </div>
      )}

      {/* Main nav */}
      <nav className={cn(
        'flex flex-1 flex-col overflow-y-auto scrollbar-thin',
        collapsed ? 'px-2' : 'px-3'
      )}>
        {isAdmin && !collapsed && (
          <Link
            href="/leads/import"
            className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground px-3 text-[13px] font-semibold text-background shadow-primary-glow transition-colors hover:bg-foreground/90"
          >
            <PlusCircle className="h-4 w-4" />
            Import
          </Link>
        )}
        {isAdmin && collapsed && (
          <Link
            href="/leads/import"
            className="mb-3 flex items-center justify-center rounded-full bg-foreground p-2.5 text-background shadow-primary-glow transition-colors hover:bg-foreground/90"
            title="Import"
          >
            <PlusCircle className="h-4 w-4" />
          </Link>
        )}

        <div className="flex flex-col gap-1">
          {visibleMain.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        {isAdmin && !collapsed && (
          <div className="mt-7">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Admin</p>
            <div className="flex flex-col gap-1">
              <NavLink item={{ label: 'Import',       href: '/leads/import',  icon: PlusCircle }} active={isActive('/leads/import')} />
              <NavLink item={{ label: 'Analytics',    href: '/analytics',     icon: BarChart2 }}  active={isActive('/analytics')} />
              <NavLink item={{ label: 'Team Members', href: '/settings/team', icon: Users }}      active={isActive('/settings/team')} />
            </div>
          </div>
        )}
        {isAdmin && collapsed && (
          <div className="mt-4 flex flex-col gap-1">
            <NavLink item={{ label: 'Import',       href: '/leads/import',  icon: PlusCircle }} active={isActive('/leads/import')} collapsed />
            <NavLink item={{ label: 'Analytics',    href: '/analytics',     icon: BarChart2 }}  active={isActive('/analytics')} collapsed />
            <NavLink item={{ label: 'Team Members', href: '/settings/team', icon: Users }}      active={isActive('/settings/team')} collapsed />
          </div>
        )}

      </nav>

      {/* Bottom nav */}
      <div className={cn(
        'flex flex-col gap-1 pb-3 pt-2',
        collapsed ? 'px-2' : 'px-3'
      )}>
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}
      </div>

      {/* Footer — user info */}
      <div className={cn(
        'flex items-center border-t border-border',
        collapsed ? 'justify-center px-2 py-3' : 'gap-2.5 px-3 py-3'
      )}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[11px] font-bold text-foreground">
          {initials}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight">{displayName}</p>
              {userEmail && (
                <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{userEmail}</p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                  aria-label="More options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" minWidth="160px">
                <DropdownMenuItem
                  onClick={() => router.push('/settings/profile')}
                  icon={<UserCog className="h-3.5 w-3.5" />}
                >
                  Profile settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                  icon={<LogOut className="h-3.5 w-3.5" />}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        'flex items-center rounded-xl text-[13.5px] font-medium transition-all duration-150',
        collapsed ? 'h-10 w-10 justify-center mx-auto' : 'gap-3 px-3 py-2.5',
        active
          ? 'bg-card text-foreground shadow-card font-semibold'
          : 'text-foreground/65 hover:bg-secondary hover:text-foreground'
      )}
    >
      <span className="relative shrink-0">
        <Icon className={cn('h-[18px] w-[18px]', active ? 'text-foreground' : 'text-foreground/60')} />
        {collapsed && item.badge != null && item.badge > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: 'hsl(var(--hot))' }}
          >
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {!collapsed && item.badge != null && item.badge > 0 && (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold leading-none text-white"
          style={{ background: 'hsl(var(--foreground))' }}
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  )
}
