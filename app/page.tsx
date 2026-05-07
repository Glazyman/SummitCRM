import { redirect } from 'next/navigation'

/**
 * Root route — redirect to dashboard.
 * Middleware will redirect unauthenticated users to /login.
 */
export default function RootPage() {
  redirect('/dashboard')
}
