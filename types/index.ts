// Re-export all database types
export * from './database'

// ─── Application-level types ─────────────────────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
}

export interface WorkspaceMemberWithProfile {
  id: string
  workspace_id: string
  user_id: string
  role: import('./database').WorkspaceRole
  joined_at: string | null
  is_active: boolean
  created_at: string
  profile: UserProfile
}

// Auth context shape
export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
}

export interface WorkspaceContext {
  id: string
  name: string
  slug: string
  role: import('./database').WorkspaceRole
}

// API response wrappers
export type ApiSuccess<T> = { data: T; error: null }
export type ApiError = { data: null; error: string }
export type ApiResponse<T> = ApiSuccess<T> | ApiError

// Pagination
export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  per_page: number
  total_pages: number
}
