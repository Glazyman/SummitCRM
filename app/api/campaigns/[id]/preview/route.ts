/**
 * POST /api/campaigns/[id]/preview
 *
 * Renders step 1 (or specified step) email for a sample lead,
 * applying merge variables to subject + body template.
 *
 * Body: { lead_id?: string, step_number?: number }
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { applyMergeVars, buildMergeContext } from '@/lib/email/merge'

const previewSchema = z.object({
  lead_id:     z.string().uuid().optional(),
  step_number: z.number().int().min(1).max(100).optional().default(1),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  try {
    const { id: campaignId } = await params
    // Validate campaign ID is a UUID
    if (!/^[0-9a-f-]{36}$/i.test(campaignId)) {
      return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let bodyRaw: unknown
    try { bodyRaw = await req.json() } catch { bodyRaw = {} }
    const parsed = previewSchema.safeParse(bodyRaw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }
    const { step_number, lead_id } = parsed.data

    const adminClient = createAdminClient()
    const { data: member } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    // Load campaign + step + sending account
    const { data: campaign } = await (adminClient as any)
      .from('campaigns')
      .select(`
        id, name, batch_id, sending_account_id,
        campaign_sequence_steps (step_number, subject_template, body_template, delay_days),
        sending_accounts (from_name, from_email)
      `)
      .eq('id', campaignId)
      .eq('workspace_id', member.workspace_id)
      .single() as {
        data: {
          id: string; name: string; batch_id: string | null; sending_account_id: string | null
          campaign_sequence_steps: Array<{ step_number: number; subject_template: string; body_template: string; delay_days: number }>
          sending_accounts: { from_name: string; from_email: string } | null
        } | null
      }

    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const step = campaign.campaign_sequence_steps.find((s) => s.step_number === step_number)
    if (!step) return NextResponse.json({ error: `Step ${step_number} not found` }, { status: 404 })

    // Get a sample lead from the batch (prefer the specified lead_id)
    let leadQuery = (adminClient as any)
      .from('leads')
      .select('id, first_name, last_name, email, company, title, website')
      .eq('workspace_id', member.workspace_id)
      .eq('is_unsubscribed', false)

    if (lead_id) {
      leadQuery = leadQuery.eq('id', lead_id)
    } else if (campaign.batch_id) {
      leadQuery = leadQuery.eq('batch_id', campaign.batch_id)
    }

    const { data: leads } = await leadQuery.limit(1) as {
      data: Array<{
        id: string; first_name: string | null; last_name: string | null
        email: string; company: string | null; title: string | null; website: string | null
      }> | null
    }

    const lead = leads?.[0]
    if (!lead) return NextResponse.json({ error: 'No eligible leads found in batch for preview' }, { status: 404 })

    const mergeCtx = buildMergeContext(
      {
        first_name: lead.first_name ?? '',
        last_name:  lead.last_name  ?? '',
        email:      lead.email,
        company:    lead.company    ?? '',
        title:      lead.title      ?? '',
        website:    lead.website    ?? '',
      },
      {
        from_name:  campaign.sending_accounts?.from_name  ?? 'Sender',
        from_email: campaign.sending_accounts?.from_email ?? '',
      },
    )

    const renderedSubject = applyMergeVars(step.subject_template, mergeCtx)
    const renderedBody    = applyMergeVars(step.body_template,    mergeCtx)

    return NextResponse.json({
      preview: {
        step_number:       step.step_number,
        delay_days:        step.delay_days,
        subject:           renderedSubject,
        body_html:         renderedBody,
        from_name:         campaign.sending_accounts?.from_name ?? '',
        from_email:        campaign.sending_accounts?.from_email ?? '',
        to_name:           [lead.first_name, lead.last_name].filter(Boolean).join(' '),
        to_email:          lead.email,
        lead_id:           lead.id,
        campaign_name:     campaign.name,
      },
    })
  } catch (err) {
    console.error('[campaign preview]', err)
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 })
  }
}
