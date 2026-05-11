/**
 * POST /api/ai/snapshot-email
 *
 * Admin-only. Generates an AI-polished company snapshot from the lead
 * profile + questionnaire answers, ready to drop into a Gmail draft.
 *
 * The deterministic builder in `lib/intake-snapshot.ts` is the client-side
 * fallback if this endpoint fails — both produce the same structural format.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { generateSnapshotEmail, isAiEnabled, logUsage } from '@/lib/ai'

const bodySchema = z.object({
  lead_id: z.string().uuid().optional(),
  lead: z.object({
    first_name: z.string().nullable(),
    last_name:  z.string().nullable(),
    email:      z.string().email(),
    phone:      z.string().nullable(),
    company:    z.string().nullable(),
    website:    z.string().nullable(),
  }),
  answers:   z.record(z.string(), z.string()),
  questions: z.array(z.object({
    id:     z.string(),
    label:  z.string(),
    type:   z.enum(['text', 'textarea', 'yesno']),
    custom: z.boolean().optional(),
  })),
})

export async function POST(req: NextRequest) {
  try {
    if (!isAiEnabled()) {
      return NextResponse.json(
        { error: 'AI is not configured. Set OPENAI_API_KEY and NEXT_PUBLIC_FEATURE_AI=true.' },
        { status: 503 },
      )
    }

    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Admin-only — matches the UI gate on the Email Snapshot button.
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string; is_active: boolean } | null }

    if (!member || !['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 422 })
    }

    const { subject, body, usage } = await generateSnapshotEmail(parsed.data)

    // Await so the row is committed before the request completes — the
    // ~50ms cost is worth the guarantee. Errors are swallowed inside logUsage.
    await logUsage({
      workspace_id: member.workspace_id,
      user_id:      user.id,
      lead_id:      parsed.data.lead_id ?? null,
      model:        'gpt-4o',
      task:         'snapshot_email',
      usage,
    })

    return NextResponse.json({ subject, body })
  } catch (err) {
    console.error('[POST /api/ai/snapshot-email]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
