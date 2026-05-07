'use client'

import { NotificationProvider } from './notification-context'

interface Props {
  userId:   string
  children: React.ReactNode
}

/**
 * Thin client wrapper so the server layout can pass userId into the
 * client-only NotificationProvider without marking the layout itself as
 * a Client Component.
 */
export function NotificationProviderWrapper({ userId, children }: Props) {
  return <NotificationProvider userId={userId}>{children}</NotificationProvider>
}
