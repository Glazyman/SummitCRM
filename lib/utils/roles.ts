import type { WorkspaceRole } from '@/types/database'

/**
 * Numeric rank for each role. Higher = more permissions.
 */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  rep: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
}

/**
 * Returns true if `userRole` meets or exceeds `requiredRole`.
 */
export function hasRole(userRole: WorkspaceRole, requiredRole: WorkspaceRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole]
}

/**
 * Returns true if the user is an admin or super_admin.
 */
export function isAdmin(role: WorkspaceRole): boolean {
  return hasRole(role, 'admin')
}

/**
 * Returns true if the user is a manager or above.
 */
export function isManager(role: WorkspaceRole): boolean {
  return hasRole(role, 'manager')
}

/**
 * Human-readable label for a role.
 */
export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  rep: 'Rep',
  viewer: 'Viewer',
}

/**
 * All roles as an ordered array (lowest → highest).
 */
export const ALL_ROLES: WorkspaceRole[] = ['viewer', 'rep', 'manager', 'admin', 'super_admin']
