import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Routes that require authentication.
 */
const PROTECTED_PATHS = ['/dashboard', '/leads', '/campaigns', '/analytics', '/settings', '/admin', '/notifications']

/**
 * Routes that are only accessible to unauthenticated users.
 */
const AUTH_ONLY_PATHS = ['/login', '/signup', '/forgot-password']

/**
 * Routes that require admin role.
 */
const ADMIN_PATHS = ['/admin']

// ── Security headers applied to every response ────────────────────────────
const SECURITY_HEADERS: Record<string, string> = {
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  // Disable MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  // Referrer policy: only send origin on same-origin requests
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Permissions policy: restrict access to browser features we don't use
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  // HSTS: 1 year, include subdomains
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    // Next.js inline scripts + RSC payloads
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Styles: allow inline (Tailwind / CSS-in-JS)
    "style-src 'self' 'unsafe-inline'",
    // Images: allow Supabase storage + data URIs + tracking pixel self-host
    "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
    // Fonts: self-hosted only
    "font-src 'self'",
    // Supabase API + Realtime
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com",
    // No <object>, <embed>, or <frame>
    "object-src 'none'",
    "frame-ancestors 'none'",
    // Force HTTPS
    'upgrade-insecure-requests',
  ].join('; '),
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Refresh session cookies and get the current user
  const { user, response } = await updateSession(request)

  const isAuthOnlyPath  = AUTH_ONLY_PATHS.some((p)  => pathname.startsWith(p))
  const isProtectedPath = PROTECTED_PATHS.some((p)  => pathname.startsWith(p))

  // ── Authenticated user visiting auth pages → redirect to dashboard ──────
  if (user && isAuthOnlyPath) {
    const res = NextResponse.redirect(new URL('/dashboard', request.url))
    return applySecurityHeaders(res)
  }

  // ── Unauthenticated user visiting protected pages → redirect to login ────
  if (!user && isProtectedPath) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    const res = NextResponse.redirect(loginUrl)
    return applySecurityHeaders(res)
  }

  // ── Admin-only path check ─────────────────────────────────────────────────
  if (user && ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    const claims = user.app_metadata as Record<string, string> | undefined
    const role   = claims?.role
    if (role && role !== 'admin' && role !== 'super_admin' && role !== 'manager') {
      const res = NextResponse.redirect(new URL('/dashboard', request.url))
      return applySecurityHeaders(res)
    }
  }

  return applySecurityHeaders(response)
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder
     * - api/track (open/click tracking — must be public)
     * - api/webhooks (inbound webhooks — must be public)
     * - unsubscribe page
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/track|api/webhooks|unsubscribe).*)',
  ],
}
