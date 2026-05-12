'use client'

import { useState } from 'react'
import { Bell, BellOff, CheckCheck, Filter, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/notifications/notification-context'
import { NotificationItem } from '@/components/notifications/notification-item'
import type { NotificationType } from '@/components/notifications/types'
import { NOTIFICATION_META } from '@/components/notifications/types'

// Only types the product actually emits. Older types (replies, bounces,
// campaigns, AI, quota) belonged to the email era and are no longer sent.
const TYPE_OPTIONS: { value: NotificationType | 'all'; label: string }[] = [
  { value: 'all',           label: 'All' },
  { value: 'mention',       label: 'Note mentions' },
  { value: 'follow_up_due', label: 'Follow-ups' },
  { value: 'lead_assigned', label: 'Lead assigned' },
]

export function NotificationsClient() {
  const { notifications, unreadCount, hasMore, isLoading, markRead, markAllRead, dismiss, fetchNotifications } =
    useNotifications()

  const [typeFilter,  setTypeFilter]  = useState<NotificationType | 'all'>('all')
  const [readFilter,  setReadFilter]  = useState<'all' | 'unread' | 'read'>('all')

  const filtered = notifications.filter(n => {
    if (typeFilter !== 'all' && n.type !== typeFilter) return false
    if (readFilter === 'unread' && n.is_read)          return false
    if (readFilter === 'read'   && !n.is_read)         return false
    return true
  })

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-4 md:px-0 py-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Type filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Filter className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value as NotificationType | 'all')}
              className={cn(
                'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                typeFilter === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Read/unread toggle */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
          {(['all', 'unread', 'read'] as const).map(v => (
            <button
              key={v}
              onClick={() => setReadFilter(v)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors',
                readFilter === v
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list */}
      <div className="rounded-xl border overflow-hidden">
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <BellOff className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">No notifications</p>
              <p className="text-sm text-muted-foreground mt-1">
                {typeFilter !== 'all' || readFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'You\'re all caught up!'}
              </p>
            </div>
          </div>
        ) : (
          <div>
            {/* Group by unread first */}
            {filtered.map((n, i) => (
              <div key={n.id} className={cn(i < filtered.length - 1 && 'border-b')}>
                <NotificationItem
                  notification={n}
                  onRead={markRead}
                  onDismiss={dismiss}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchNotifications()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Load more
          </button>
        </div>
      )}

      {/* Notification type legend */}
      <div className="rounded-xl border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Notification types
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.entries(NOTIFICATION_META) as [NotificationType, typeof NOTIFICATION_META[NotificationType]][]).map(
            ([type, meta]) => (
              <div key={type} className="flex items-center gap-2">
                <span className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center text-xs flex-shrink-0',
                  meta.bgColor, meta.color
                )}>
                  {meta.icon}
                </span>
                <span className="text-xs text-muted-foreground truncate">{meta.label}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Preferences link */}
      <p className="text-center text-sm text-muted-foreground">
        Manage what you are notified about in{' '}
        <a href="/settings/notifications" className="text-primary hover:underline">
          Notification preferences
        </a>
      </p>
    </div>
  )
}
