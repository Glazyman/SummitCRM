import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  name:               z.string().min(1).max(200).optional(),
  description:        z.string().max(1000).optional(),
  batch_id:           z.string().uuid().optional(),
  sending_account_id: z.string().uuid().optional(),
  scheduled_start:    z.string().datetime().nullish(),
  steps: z.array(z.object({
    step_number:      z.number().int().min(1).max(20),
    subject_template: z.string().min(1).max(500),
    body_template:    z.string().min(1),
    delay_days:       z.number().int().min(0).max(365).default(0),
    use_ai:           z.boolean().default(false),
    ai_tone:          z.enum(['professional', 'casual', 'direct', 'friendly']).default('professional'),
  })).min(1).max(20).optional(),
})

async function getWorkspaceMember(userId: string) {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null }
  return data
}

// ── GET /api/campaigns/[id] ───────────────────────────────────────────────
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const member = await getWorkspaceMember(user.id)
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const adminClient = createAdminClient()
    const { data: campaign, error } = await adminClient
      .from('campaigns')
      .select(`
        *,
        campaign_sequence_steps (
          id, step_number, subject_template, body_template,
          delay_days, use_ai, ai_tone, created_at
        ),
        lead_batches (name, lead_count),
        sending_accounts (name, from_email)
      `)
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single()

    if (error) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    return NextResponse.json({ campaign })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH /api/campaigns/[id] — edit draft only ───────────────────────────
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const member = await getWorkspaceMember(user.id)
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin', 'manager'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })

    const adminClient = createAdminClient()

    // Verify campaign exists + is a draft
    const { data: existing } = await adminClient
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string; status: string } | null }

    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft campaigns can be edited' }, { status: 409 })
    }

    const { steps, ...campaignFields } = parsed.data

    // Update campaign fields
    if (Object.keys(campaignFields).length > 0) {
      await adminClient.from('campaigns').update({ ...campaignFields, updated_at: new Date().toISOString() }).eq('id', id)
    }

    // Replace steps if provided
    if (steps) {
      await adminClient.from('campaign_sequence_steps').delete().eq('campaign_id', id)
      await adminClient.from('campaign_sequence_steps').insert(
        steps.map((s) => ({ campaign_id: id, ...s }))
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE /api/campaigns/[id] — admin, draft only ───────────────────────
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const member = await getWorkspaceMember(user.id)
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 })
    }

    const adminClient = createAdminClient()
    const { data: existing } = await adminClient
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string; status: string } | null }

    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!['draft', 'cancelled'].includes(existing.status)) {
      return NextResponse.json({ error: 'Only draft or cancelled campaigns can be deleted' }, { status: 409 })
    }

    await adminClient.from('campaigns').delete().eq('id', id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
