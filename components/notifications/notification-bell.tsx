'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from './notification-context'
import { NotificationPanel } from './notification-panel'

export function NotificationBell() {
  const { unreadCount } = useNotifications()
  const [open,  setOpen]  = useState(false)
  const [shake, setShake] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  // Listen for real-time shake events
  useEffect(() => {
    const handleNew = () => {
      setShake(true)
      setTimeout(() => setShake(false), 1000)
    }
    window.addEventListener('notification:new', handleNew)
    return () => window.removeEventListener('notification:new', handleNew)
  }, [])

  return (
    <div ref={bellRef} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'relative flex items-center justify-center w-9 h-9 rounded-lg',
          'text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
          open && 'bg-muted text-foreground',
          shake && 'animate-bell-shake'
        )}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="w-[18px] h-[18px]" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5',
              'min-w-[18px] h-[18px] px-1',
              'flex items-center justify-center',
              'rounded-full bg-primary text-primary-foreground',
              'text-[10px] font-bold leading-none',
              'ring-2 ring-background',
              'transition-transform',
              shake && 'scale-110'
            )}
            aria-hidden
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationPanel
        open={open}
        anchorRef={bellRef}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
