'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Bell, BellOff, CheckCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from './notification-context'
import { NotificationItem } from './notification-item'

interface Props {
  open:     boolean
  onClose:  () => void
}

export function NotificationPanel({ open, onClose }: Props) {
  const { notifications, unreadCount, isLoading, markRead, markAllRead, dismiss } = useNotifications()
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const unread = notifications.filter(n => !n.is_read)
  const read   = notifications.filter(n => n.is_read)

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute right-0 top-full mt-2 z-50',
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
          href="/notifications"
          onClick={onClose}
          className="block text-center text-xs text-primary hover:underline font-medium"
        >
          View all notifications →
        </Link>
      </div>
    </div>
  )
}
