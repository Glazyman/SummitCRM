import type { WorkspaceRole } from '@/types/database'

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  rep:         1,
  admin:       2,
  super_admin: 3,
}

export function hasRole(userRole: WorkspaceRole, requiredRole: WorkspaceRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole]
}

export function isAdmin(role: WorkspaceRole): boolean {
  return hasRole(role, 'admin')
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  super_admin: 'Admin',
  admin:       'Admin',
  rep:         'Rep',
}

export const ALL_ROLES: WorkspaceRole[] = ['rep', 'admin', 'super_admin']
