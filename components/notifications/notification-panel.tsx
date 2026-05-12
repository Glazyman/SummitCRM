'use client'

import { useEffect, useRef, useState, useLayoutEffect, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Bell, BellOff, CheckCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from './notification-context'
import { NotificationItem } from './notification-item'

interface Props {
  open:       boolean
  /** Bell wrapper — panel position is computed from its bounding rect. */
  anchorRef:  RefObject<HTMLElement | null>
  onClose:    () => void
}

export function NotificationPanel({ open, anchorRef, onClose }: Props) {
  const { notifications, unreadCount, isLoading, markRead, markAllRead, dismiss } = useNotifications()
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  // Portals must render after mount (no SSR document.body).
  useEffect(() => { setMounted(true) }, [])

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
      <div className="overflow-y-auto max-h-[480px]">
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <BellOff className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-0.5">No new notifications</p>
            </div>
          </div>
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
