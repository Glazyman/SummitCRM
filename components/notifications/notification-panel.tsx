'use client'

import { useEffect, useRef, useState, useLayoutEffect, useCallback, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, CheckCheck, Loader2, AlertTriangle, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from './notification-context'
import { NotificationItem } from './notification-item'

interface Props {
  open:       boolean
  /** Bell wrapper — panel position is computed from its bounding rect. */
  anchorRef:  RefObject<HTMLElement | null>
  onClose:    () => void
}

interface ActivityItem {
  id:     string
  title:  string
  due_at: string
  lead:   { id: string; first_name: string | null; last_name: string | null; company: string | null; phone: string | null } | null
}
interface DueData {
  overdue:  ActivityItem[]
  dueToday: ActivityItem[]
  upcoming: ActivityItem[]
  count:    number
}

function leadDisplay(lead: ActivityItem['lead']): string {
  if (!lead) return 'Unknown'
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  return name || lead.company || 'Unknown'
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
function fmtDay(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function NotificationPanel({ open, anchorRef, onClose }: Props) {
  const { notifications, unreadCount, isLoading, markRead, markAllRead, dismiss } = useNotifications()
  const router  = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [activities, setActivities] = useState<DueData | null>(null)
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  // Portals must render after mount (no SSR document.body).
  useEffect(() => { setMounted(true) }, [])

  // Fetch activities (overdue / today / upcoming) when the panel opens.
  const loadActivities = useCallback(async () => {
    setActivitiesLoading(true)
    try {
      const res = await fetch('/api/activities/due')
      if (res.ok) setActivities(await res.json() as DueData)
    } finally {
      setActivitiesLoading(false)
    }
  }, [])
  useEffect(() => { if (open) loadActivities() }, [open, loadActivities])

  // Position the panel below + aligned-right with the bell.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const update = () => {
      if (!anchorRef.current) return
      const r = anchorRef.current.getBoundingClientRect()
      setPos({
        top:   r.bottom + 8,                          // 8 px gap below the bell
        right: window.innerWidth - r.right,           // distance from viewport's right edge
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)   // capture phase — catches scroll on inner containers
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return  // clicking the bell toggles, don't double-handle
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, anchorRef])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || !mounted || !pos) return null

  const unread = notifications.filter(n => !n.is_read)
  const read   = notifications.filter(n => n.is_read)

  // Render via portal at document.body level — escapes the sticky
  // header's z-20 stacking context so the panel renders above side
  // panels (z-50), modals, etc.
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 100 }}
      className={cn(
        'w-[380px] max-w-[calc(100vw-2rem)]',
        'rounded-xl border bg-popover shadow-card',
        'flex flex-col overflow-hidden',
        'animate-in fade-in slide-in-from-top-2 duration-150'
      )}
      role="dialog"
      aria-label="Notifications"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-foreground" />
          <span className="font-semibold text-sm">Notifications</span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-[520px]">

        {/* ── Activities (overdue / today / upcoming) ──────────────── */}
        {(activities && (activities.overdue.length > 0 || activities.dueToday.length > 0 || activities.upcoming.length > 0)) && (
          <div className="p-1.5 border-b">
            {activities.overdue.length > 0 && (
              <ActivityGroup
                label="Overdue"
                icon={<AlertTriangle className="w-3 h-3" />}
                accent="text-red-600"
                items={activities.overdue}
                onPick={() => onClose()}
                router={router}
              />
            )}
            {activities.dueToday.length > 0 && (
              <ActivityGroup
                label="Today"
                icon={<Calendar className="w-3 h-3" />}
                accent="text-amber-600"
                items={activities.dueToday}
                onPick={() => onClose()}
                router={router}
              />
            )}
            {activities.upcoming.length > 0 && (
              <ActivityGroup
                label="Upcoming"
                icon={<Calendar className="w-3 h-3" />}
                accent="text-muted-foreground"
                items={activities.upcoming.slice(0, 5)}
                onPick={() => onClose()}
                router={router}
                showDay
              />
            )}
          </div>
        )}

        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          !activities || activities.count === 0 && activities.upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <BellOff className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-0.5">No notifications or activities</p>
              </div>
            </div>
          ) : null
        ) : (
          <div className="p-1.5">
            {/* Unread section */}
            {unread.length > 0 && (
              <div>
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  New
                </p>
                {unread.map(n => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={markRead}
                    onDismiss={dismiss}
                    onNavigate={onClose}
                    compact
                  />
                ))}
              </div>
            )}

            {/* Read section */}
            {read.length > 0 && (
              <div className={unread.length > 0 ? 'mt-2' : ''}>
                {unread.length > 0 && (
                  <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Earlier
                  </p>
                )}
                {read.slice(0, 5).map(n => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={markRead}
                    onDismiss={dismiss}
                    onNavigate={onClose}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2.5">
        <Link
          href="/settings/notifications"
          onClick={onClose}
          className="block text-center text-xs text-primary hover:underline font-medium"
        >
          View all notifications →
        </Link>
      </div>
    </div>,
    document.body,
  )
}

// ── Activity group (overdue / today / upcoming sections) ──────────────
function ActivityGroup({
  label, icon, accent, items, onPick, router, showDay,
}: {
  label:    string
  icon:     React.ReactNode
  accent:   string
  items:    ActivityItem[]
  onPick:   () => void
  router:   ReturnType<typeof useRouter>
  showDay?: boolean
}) {
  return (
    <div className="px-1 pt-1 pb-1">
      <p className={cn('flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider', accent)}>
        {icon}
        {label}
        <span className="ml-1 text-muted-foreground">({items.length})</span>
      </p>
      {items.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => {
            onPick()
            if (a.lead?.id) router.push(`/leads/${a.lead.id}`)
          }}
          className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
        >
          <span className="mt-0.5 text-[11px] font-medium tabular-nums text-muted-foreground min-w-[58px]">
            {showDay ? `${fmtDay(a.due_at)} ${fmtTime(a.due_at)}` : fmtTime(a.due_at)}
          </span>
          <span className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{leadDisplay(a.lead)}</p>
            <p className="truncate text-xs text-muted-foreground">{a.title}</p>
          </span>
        </button>
      ))}
    </div>
  )
}
