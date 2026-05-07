'use client'

import { useWorkspace } from '@/hooks/use-workspace'
import { hasRole } from '@/lib/utils/roles'
import type { WorkspaceRole } from '@/types/database'

interface RoleGateProps {
  /** Minimum role required to render children */
  require: WorkspaceRole
  children: React.ReactNode
  /** Optional fallback content to render instead of null */
  fallback?: React.ReactNode
}

/**
 * Conditionally renders children based on the current user's role.
 *
 * Usage:
 *   <RoleGate require="admin">
 *     <AdminOnlyContent />
 *   </RoleGate>
 *
 * Returns null (or fallback) if the user's role is insufficient.
 * Does NOT make a network request — reads role from the useWorkspace hook.
 */
export function RoleGate({ require: requiredRole, children, fallback = null }: RoleGateProps) {
  const { role, loading } = useWorkspace()

  // While loading, render nothing to avoid flash of content
  if (loading) return null

  // No role = not a member = no access
  if (!role) return <>{fallback}</>

  if (!hasRole(role, requiredRole)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
