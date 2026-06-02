import { createServerClient as _createServerClient } from '@supabase/ssr'
import { createClient as _createBrowserClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

type CookieStore = Awaited<ReturnType<typeof cookies>>

/**
 * Supabase client for Server Components, Server Actions, and API Routes.
 * Reads/writes session cookies via Next.js cookie store.
 * All queries are scoped by RLS using the authenticated user's JWT.
 */
export async function createClient(cookieStore?: CookieStore) {
  const store = cookieStore ?? await cookies()

  return _createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              store.set(name, value, options)
            })
          } catch {
            // setAll called from a Server Component — cookies cannot be mutated.
            // This is safe to ignore; the middleware will handle session refresh.
          }
        },
      },
    }
  )
}

/**
 * Alias for createClient — named export used by new API route files.
 * Accepts an optional pre-resolved cookie store.
 */
export async function createServerClient(
  cookieStore?: CookieStore
) {
  return createClient(cookieStore)
}

/**
 * Admin (service-role) Supabase client.
 * Bypasses RLS — ONLY use server-side for privileged operations
 * (vault access, webhook handlers, queue processing).
 * Never expose to the client.
 *
 * Typed as `any` for the Database generic so API routes can insert/update
 * tables that are not yet fully represented in types/database.ts.
 */
export function createAdminClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return _createBrowserClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
