import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const ALL_TYPES = [
  'reply_received',
  'bounce',
  'campaign_complete',
  'quota_warning',
  'follow_up_due',
  'lead_assigned',
  'ai_budget_warning',
  'ai_budget_critical',
  'ai_batch_complete',
]

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServerClient>>, userId: string) {
  const sb = supabase as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  return member?.workspace_id as string | null
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceId = await getWorkspaceId(supabase, user.id)
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 400 })

  const sb = supabase as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: rows } = await sb
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)

  const saved = new Map((rows ?? []).map((r: { type: string }) => [r.type, r]))
  const preferences = ALL_TYPES.map(type => saved.get(type) ?? {
    type,
    in_app: true,
    email_digest: true,
  })

  return NextResponse.json({ preferences })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceId = await getWorkspaceId(supabase, user.id)
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 400 })

  // Validate body
  const prefUpdateSchema = z.array(
    z.object({
      type:         z.string().min(1).max(60),
      in_app:       z.boolean().optional(),
      email_digest: z.boolean().optional(),
    })
  )

  let bodyRaw: unknown
  try { bodyRaw = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsedBody = prefUpdateSchema.safeParse(Array.isArray(bodyRaw) ? bodyRaw : [bodyRaw])
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsedBody.error.issues }, { status: 422 })
  }
  const updates = parsedBody.data

  const sb = supabase as any // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const update of updates) {
    await sb
      .from('notification_preferences')
      .upsert(
        {
          user_id:      user.id,
          workspace_id: workspaceId,
          type:         update.type,
          ...(update.in_app      !== undefined && { in_app: update.in_app }),
          ...(update.email_digest !== undefined && { email_digest: update.email_digest }),
        },
        { onConflict: 'user_id,workspace_id,type' }
      )
  }

  return NextResponse.json({ success: true })
}
