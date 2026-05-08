'use client'

import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Notification } from './types'
import { NOTIFICATION_META } from './types'
import { formatDistanceToNowStrict } from 'date-fns'

interface Props {
  notification: Notification
  onRead:    (id: string) => void
  onDismiss: (id: string) => void
  compact?:  boolean
}

export function NotificationItem({ notification: n, onRead, onDismiss, compact }: Props) {
  const router = useRouter()
  const meta   = NOTIFICATION_META[n.type] ?? NOTIFICATION_META.system

  const timeAgo = (() => {
    try { return formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true }) }
    catch { return '' }
  })()

  const handleClick = () => {
    if (!n.is_read) onRead(n.id)
    if (n.link) router.push(n.link)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
      className={cn(
        'group relative flex items-start gap-3 rounded-lg px-3 py-3 transition-colors cursor-pointer',
        'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !n.is_read && 'bg-muted/30',
        compact && 'px-2 py-2'
      )}
    >
      {/* Type icon bubble */}
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium select-none',
        meta.bgColor, meta.color
      )}>
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm leading-snug line-clamp-2',
          !n.is_read ? 'font-medium text-foreground' : 'text-muted-foreground'
        )}>
          {n.title}
        </p>
        {n.body && !compact && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/70">{timeAgo}</p>
      </div>

      {/* Unread dot */}
      {!n.is_read && (
        <span className="flex-shrink-0 mt-2 w-2 h-2 rounded-full bg-secondary" aria-label="Unread" />
      )}

      {/* Dismiss button */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss(n.id) }}
        className={cn(
          'absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity',
          'text-muted-foreground hover:text-foreground hover:bg-muted'
        )}
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
