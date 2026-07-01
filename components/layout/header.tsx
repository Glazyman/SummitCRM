'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, User, Menu, Settings, ChevronDown, Search, X, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { ViewAsSwitcher } from '@/components/layout/view-as-switcher'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { WorkspaceRole } from '@/types/database'

// ── Role badge ────────────────────────────────────────────────────────────
const ROLE_STYLES: Record<WorkspaceRole, string> = {
  super_admin: 'border-border bg-secondary text-foreground',
  admin:       'border-border bg-secondary text-foreground',
  rep:         'border-border bg-secondary text-foreground',
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  super_admin: 'Admin',
  admin:       'Admin',
  rep:         'Rep',
}

function RoleBadge({ role }: { role: WorkspaceRole }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
      ROLE_STYLES[role]
    )}>
      {ROLE_LABELS[role]}
    </span>
  )
}

// ── Header ────────────────────────────────────────────────────────────────
interface HeaderProps {
  user:             SupabaseUser | null
  /** Effective role — the impersonated teammate's role while viewing-as. */
  role?:            WorkspaceRole | null
  workspaceName?:   string | null
  onMenuClick?:     () => void
  /** Real caller's role — gates the "View as" switcher (real admins only). */
  realRole?:        WorkspaceRole | null
  isImpersonating?: boolean
  impersonatedName?: string | null
}

interface SearchLead {
  id: string
  name: string
  email: string
  phone: string | null
  company: string | null
  title: string | null
  status: string
}

export function Header({ user, role, workspaceName, onMenuClick, realRole, isImpersonating, impersonatedName }: HeaderProps) {
  const router   = useRouter()
  const supabase = createClient()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [searchResults, setSearchResults] = useState<SearchLead[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedLead, setSelectedLead] = useState<SearchLead | null>(null)
  const [resultsOpen, setResultsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef   = useRef<HTMLInputElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setResultsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Open search with ⌘K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      const clearId = window.setTimeout(() => {
        setSearchResults([])
        setSearchLoading(false)
      }, 0)
      return () => window.clearTimeout(clearId)
    }

    const id = window.setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/leads/search?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        setSearchResults((json.leads ?? []) as SearchLead[])
        setResultsOpen(true)
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 180)

    return () => window.clearTimeout(id)
  }, [searchQuery])

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

  function handleMobileMenu() {
    if (onMenuClick) { onMenuClick(); return }
    window.dispatchEvent(new Event('open-mobile-sidebar'))
  }

  function runSearch() {
    if (!searchQuery.trim()) return
    router.push(`/leads?q=${encodeURIComponent(searchQuery.trim())}`)
    setSearchOpen(false)
    setResultsOpen(false)
    setSearchQuery('')
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    runSearch()
  }

  const fullName    = user?.user_metadata?.full_name as string | undefined
  const email       = user?.email ?? ''
  const displayName = fullName ?? email

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[var(--header-height)] shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
        {/* Mobile menu */}
        <button
          type="button"
          onClick={handleMobileMenu}
          className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Search pill */}
        <div ref={searchBoxRef} className="relative hidden md:block md:ml-auto w-64 lg:w-80">
          <form
            onSubmit={handleSearch}
            className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-muted-foreground"
          >
            <Search className="h-4 w-4 shrink-0" />
            <input
              ref={searchRef}
              value={searchQuery}
              onFocus={() => { if (searchResults.length > 0) setResultsOpen(true) }}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground min-w-0"
              placeholder="Search leads, deals, people…"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); setResultsOpen(false) }} className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          {resultsOpen && (searchLoading || searchResults.length > 0) && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-border bg-popover shadow-card">
              {searchLoading ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
              ) : (
                <div className="max-h-80 overflow-auto py-1">
                  {searchResults.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => {
                        setSelectedLead(lead)
                        setResultsOpen(false)
                        setSearchQuery('')
                      }}
                      className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-secondary"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{lead.company ?? 'No company'} · {lead.email}</p>
                      </div>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase text-muted-foreground">{lead.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right actions — pushed to the right edge (ml-auto on mobile where the
            search pill that normally does this is hidden). */}
        <div className="flex shrink-0 items-center gap-2 ml-auto md:ml-2">
          {/* Mobile search button */}
          <button
            type="button"
            onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50) }}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-secondary transition-colors md:hidden"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Admin-only "view as" (impersonation) switcher */}
          <ViewAsSwitcher
            realRole={realRole ?? null}
            isImpersonating={isImpersonating ?? false}
            impersonatedName={impersonatedName ?? null}
          />

          {/* One bell for everyone — mentions + lead-assigned + today's
              activities + upcoming activities, all in the same dropdown. */}
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-secondary transition-colors relative z-30">
            <NotificationBell />
          </div>

          {/* User dropdown — round avatar pill */}
          <div className="relative ml-0.5 z-30" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={cn(
                'flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 py-1 text-sm transition-colors',
                'hover:bg-secondary',
                dropdownOpen && 'bg-secondary'
              )}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
            >
              <Avatar name={displayName} size="sm" />
              <span className="hidden max-w-[100px] truncate text-[13px] font-semibold md:block">
                {fullName ?? email.split('@')[0]}
              </span>
              <ChevronDown className={cn(
                'hidden h-3 w-3 text-muted-foreground transition-transform duration-150 md:block',
                dropdownOpen && 'rotate-180'
              )} />
            </button>

            {dropdownOpen && (
              <div
                role="menu"
                className={cn(
                  // Mobile: fixed, centered below the header with even 12px gutters.
                  'fixed inset-x-3 top-[68px] z-50 w-auto overflow-hidden rounded-2xl border border-border bg-popover shadow-card',
                  // Desktop (≥sm): original right-aligned dropdown anchored to the avatar.
                  'sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-56'
                )}
              >
                <div className="px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={displayName} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{fullName ?? 'User'}</p>
                      <p className="truncate text-xs text-muted-foreground">{email}</p>
                    </div>
                  </div>
                  {role && <div className="mt-2.5"><RoleBadge role={role} /></div>}
                  {workspaceName && <p className="mt-1.5 truncate text-xs text-muted-foreground">{workspaceName}</p>}
                </div>

                <div className="border-t border-border" />

                <div className="py-1" role="none">
                  <button role="menuitem" type="button" onClick={() => navigate('/settings')}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-secondary">
                    <Settings className="h-4 w-4 text-muted-foreground" /> Settings
                  </button>
                  <button role="menuitem" type="button" onClick={() => navigate('/settings/profile')}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-secondary">
                    <User className="h-4 w-4 text-muted-foreground" /> Profile
                  </button>
                </div>

                <div className="border-t border-border" />
                <div className="py-1" role="none">
                  <button role="menuitem" type="button" onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-secondary">
                    <LogOut className="h-4 w-4" /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile full-screen search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col p-4 md:hidden">
          <form onSubmit={handleSearch} className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 shadow-card">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search leads…"
              className="flex-1 bg-transparent text-sm outline-none"
              autoFocus
            />
            <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery('') }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </form>
          {searchQuery.trim() && (
            <button type="button" onClick={runSearch}
              className="mt-3 rounded-full bg-primary text-primary-foreground py-3 text-sm font-semibold">
              Search for &quot;{searchQuery}&quot;
            </button>
          )}
        </div>
      )}

      {selectedLead && (
        <div className="fixed inset-0 z-50">
          <button type="button" onClick={() => setSelectedLead(null)} className="absolute inset-0 bg-black/30" aria-label="Close contact card" />
          <div className="absolute right-0 top-0 h-full w-full max-w-md border-l border-border bg-background shadow-2xl">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lead Contact</p>
                  <h3 className="text-base font-semibold">{selectedLead.name}</h3>
                </div>
                <button type="button" onClick={() => setSelectedLead(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 p-4 text-sm">
                <div className="rounded-2xl border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedLead.email}</p>
                </div>
                <div className="rounded-2xl border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedLead.phone ?? '—'}</p>
                </div>
                <div className="rounded-2xl border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Company</p>
                  <p className="font-medium">{selectedLead.company ?? '—'}</p>
                </div>
                <div className="rounded-2xl border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Title</p>
                  <p className="font-medium">{selectedLead.title ?? '—'}</p>
                </div>
                <div className="rounded-2xl border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{selectedLead.status.replace('_', ' ')}</p>
                </div>
                <Link
                  href={`/leads/${selectedLead.id}`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Full Lead
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
