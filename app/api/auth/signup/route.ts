import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiSuccess, apiError, apiServerError } from '@/lib/utils/api'
import { slugify } from '@/lib/utils'
import { rateLimit, getRateLimitKey, rateLimitResponse, SIGNUP_LIMIT } from '@/lib/security/rate-limit'

const signupSchema = z.object({
  fullName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  workspaceName: z.string().min(1).max(100),
})

export async function POST(request: NextRequest) {
  // Rate limit: 5 signups per IP per minute
  const rl = rateLimit(getRateLimitKey(request), SIGNUP_LIMIT.prefix, SIGNUP_LIMIT.limit, SIGNUP_LIMIT.windowMs)
  if (!rl.success) return rateLimitResponse(rl.resetIn)

  try {
    const body = await request.json()
    const parsed = signupSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message)
    }

    const { fullName, email, password, workspaceName } = parsed.data

    // 1. Create the auth user
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (authError) {
      return apiError(authError.message)
    }

    if (!authData.user) {
      return apiError('Failed to create account')
    }

    // 2. Create workspace and member record using admin client (bypasses RLS for setup)
    const admin = createAdminClient()

    const slug = slugify(workspaceName) + '-' + Math.random().toString(36).slice(2, 6)

    const { data: workspace, error: wsError } = await admin
      .from('workspaces')
      .insert({ name: workspaceName, slug } as never)
      .select()
      .single() as { data: { id: string; name: string } | null; error: unknown }

    if (wsError || !workspace) {
      // Cleanup: delete the auth user since workspace creation failed
      await admin.auth.admin.deleteUser(authData.user.id)
      return apiServerError(wsError)
    }

    // 3. Add user as admin of the new workspace
    const { error: memberError } = await admin.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: authData.user.id,
      role: 'admin',
      joined_at: new Date().toISOString(),
    } as never)

    if (memberError) {
      await admin.auth.admin.deleteUser(authData.user.id)
      return apiServerError(memberError)
    }

    return apiSuccess({ userId: authData.user.id, workspaceId: workspace.id }, 201)
  } catch (err) {
    return apiServerError(err)
  }
}
