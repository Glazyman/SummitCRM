import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

// ── Validation ────────────────────────────────────────────────────────────
const stepSchema = z.object({
  step_number:      z.number().int().min(1).max(20),
  subject_template: z.string().min(1).max(500),
  body_template:    z.string().min(1),
  delay_days:       z.number().int().min(0).max(365).default(0),
  use_ai:           z.boolean().default(false),
  ai_tone:          z.enum(['professional', 'casual', 'direct', 'friendly']).default('professional'),
})

const createSchema = z.object({
  name:               z.string().min(1).max(200),
  description:        z.string().max(1000).optional(),
  batch_id:           z.string().uuid(),
  sending_account_id: z.string().uuid(),
  scheduled_start:    z.string().datetime().nullish(),
  steps:              z.array(stepSchema).min(1).max(20),
})

// ── GET /api/campaigns — list ─────────────────────────────────────────────
export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = createAdminClient()

    // Get workspace from JWT claim
    const { data: member } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace found' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data: campaigns, error } = await adminClient
      .from('campaigns')
      .select(`
        id, name, description, status, total_leads,
        emails_sent, emails_opened, emails_clicked, emails_replied, emails_bounced,
        scheduled_start, started_at, completed_at, paused_at, created_at,
        batch_id, sending_account_id,
        lead_batches (name),
        sending_accounts (name, from_email)
      `)
      .eq('workspace_id', member.workspace_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ campaigns: campaigns ?? [] })
  } catch (err) {
    console.error('[GET /api/campaigns]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST /api/campaigns — create ──────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { data: member } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { name, description, batch_id, sending_account_id, scheduled_start, steps } = parsed.data

    // Verify batch + account belong to this workspace
    const [{ data: batch }, { data: account }] = await Promise.all([
      adminClient.from('lead_batches').select('id, lead_count').eq('id', batch_id).eq('workspace_id', member.workspace_id).single(),
      adminClient.from('sending_accounts').select('id').eq('id', sending_account_id).eq('workspace_id', member.workspace_id).eq('is_active', true).single(),
    ]) as [{ data: { id: string; lead_count: number } | null }, { data: { id: string } | null }]

    if (!batch)   return NextResponse.json({ error: 'Batch not found or not in this workspace' }, { status: 404 })
    if (!account) return NextResponse.json({ error: 'Sending account not found, inactive, or not in this workspace' }, { status: 404 })

    // Create campaign + steps in a transaction-like sequence
    const { data: campaign, error: campErr } = await adminClient
      .from('campaigns')
      .insert({
        workspace_id:       member.workspace_id,
        created_by:         user.id,
        name,
        description:        description ?? null,
        batch_id,
        sending_account_id,
        scheduled_start:    scheduled_start ?? null,
        status:             'draft',
      })
      .select()
      .single() as { data: { id: string } | null; error: unknown }

    if (campErr || !campaign) {
      console.error('[POST /api/campaigns] create campaign:', campErr)
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    }

    // Insert steps
    const stepRows = steps.map((s) => ({
      campaign_id:      campaign.id,
      step_number:      s.step_number,
      subject_template: s.subject_template,
      body_template:    s.body_template,
      delay_days:       s.delay_days,
      use_ai:           s.use_ai,
      ai_tone:          s.ai_tone,
    }))

    const { error: stepsErr } = await adminClient
      .from('campaign_sequence_steps')
      .insert(stepRows)

    if (stepsErr) {
      // Rollback campaign
      await adminClient.from('campaigns').delete().eq('id', campaign.id)
      throw stepsErr
    }

    return NextResponse.json({ campaign_id: campaign.id }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/campaigns]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
