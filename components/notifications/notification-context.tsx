'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Notification } from './types'

interface NotificationContextValue {
  notifications:     Notification[]
  unreadCount:       number
  hasMore:           boolean
  isLoading:         boolean
  fetchNotifications: (opts?: { reset?: boolean }) => Promise<void>
  markRead:          (id: string) => Promise<void>
  markAllRead:       () => Promise<void>
  dismiss:           (id: string) => Promise<void>
  addRealtime:       (n: Notification) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider')
  return ctx
}

interface Props {
  userId:      string
  children:    React.ReactNode
  /** Pass the Supabase browser client to enable Realtime */
  supabaseUrl?: string
  supabaseKey?: string
}

export function NotificationProvider({ userId, children }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [totalCount,    setTotalCount]    = useState(0)
  const [isLoading,     setIsLoading]     = useState(false)
  const [page,          setPage]          = useState(1)
  const shakeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count')
      if (res.ok) {
        const data = await res.json()
        setUnreadCount(data.count ?? 0)
      }
    } catch { /* silent */ }
  }, [])

  const fetchNotifications = useCallback(async (opts?: { reset?: boolean }) => {
    const targetPage = opts?.reset ? 1 : page
    setIsLoading(true)
    try {
      const res = await fetch(`/api/notifications?page=${targetPage}&limit=20`)
      if (res.ok) {
        const data = await res.json() as { notifications: Notification[]; total?: number }
        setTotalCount(data.total ?? 0)
        if (opts?.reset) {
          setNotifications(data.notifications)
          setPage(2)
        } else {
          setNotifications(prev => [...prev, ...data.notifications])
          setPage(p => p + 1)
        }
        await fetchUnreadCount()
      }
    } finally {
      setIsLoading(false)
    }
  }, [fetchUnreadCount, page])
  const hasMore = notifications.length < totalCount

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
  }, [])

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
    await fetch('/api/notifications/read-all', { method: 'POST' })
  }, [])

  const dismiss = useCallback(async (id: string) => {
    const notif = notifications.find(n => n.id === id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (notif && !notif.is_read) setUnreadCount(prev => Math.max(0, prev - 1))
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
  }, [notifications])

  const addRealtime = useCallback((n: Notification) => {
    setNotifications(prev => [n, ...prev])
    setUnreadCount(prev => prev + 1)

    // Trigger a shake on the bell by broadcasting a custom event
    window.dispatchEvent(new CustomEvent('notification:new'))
    clearTimeout(shakeTimeout.current)
    shakeTimeout.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('notification:shake-end'))
    }, 1000)
  }, [])

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications({ reset: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Realtime subscription via Supabase client (dynamic import to avoid SSR issues)
  useEffect(() => {
    if (!userId) return
    let cleanup: (() => void) | undefined

    import('@supabase/supabase-js').then(({ createClient }) => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      if (!url || !key) return

      const supabase = createClient(url, key)
      const channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event:  'INSERT',
            schema: 'public',
            table:  'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            addRealtime(payload.new as Notification)
          }
        )
        .subscribe()

      cleanup = () => { supabase.removeChannel(channel) }
    })

    return () => { cleanup?.() }
  }, [userId, addRealtime])

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      hasMore,
      isLoading,
      fetchNotifications,
      markRead,
      markAllRead,
      dismiss,
      addRealtime,
    }}>
      {children}
    </NotificationContext.Provider>
  )
}
