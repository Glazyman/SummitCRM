import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Supabase admin client — bypasses RLS via service role key.
 *
 * ONLY USE IN:
 *   - Server-side API routes for privileged operations (audit logging, etc.)
 *   - Supabase Edge Functions
 *
 * NEVER:
 *   - Use in Client Components
 *   - Expose SUPABASE_SERVICE_ROLE_KEY to the browser
 *   - Use when a normal user-scoped client will suffice
 */
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
