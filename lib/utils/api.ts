import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/types'

/**
 * Standard API success response.
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null }, { status })
}

/**
 * Standard API error response.
 */
export function apiError(message: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ data: null, error: message }, { status })
}

/**
 * Standard 401 Unauthorized.
 */
export function apiUnauthorized() {
  return apiError('Unauthorized', 401)
}

/**
 * Standard 403 Forbidden.
 */
export function apiForbidden(message = 'Insufficient permissions') {
  return apiError(message, 403)
}

/**
 * Standard 404 Not Found.
 */
export function apiNotFound(resource = 'Resource') {
  return apiError(`${resource} not found`, 404)
}

/**
 * Standard 500 Internal Server Error.
 */
export function apiServerError(err?: unknown) {
  const message = err instanceof Error ? err.message : 'Internal server error'
  console.error('[API Error]', err)
  return apiError(message, 500)
}
