import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Drop-in for `supabase.auth.getUser()` that verifies the session JWT locally
 * (ES256 signing keys, JWKS cached by supabase-js) instead of a round-trip to
 * the Auth server on every request. Same `{ data: { user }, error }` shape.
 *
 * Only identity fields carried in the JWT are populated (id, email, phone,
 * app_metadata, user_metadata). A revoked session stays valid until its access
 * token expires; workspace access is still re-checked live via workspace_members.
 */
export async function getVerifiedUser(supabase: { auth: Pick<SupabaseClient['auth'], 'getClaims'> }) {
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return { data: { user: null }, error }
  const user = {
    id:            claims.sub,
    email:         claims.email,
    phone:         claims.phone,
    aud:           claims.aud,
    role:          claims.role,
    app_metadata:  claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
  } as unknown as User
  return { data: { user }, error: null }
}
